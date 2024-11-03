import User from '../models/user.js'
import { StatusCodes } from 'http-status-codes'
import { OAuth2Client } from 'google-auth-library'
import jwt from 'jsonwebtoken'
import validator from 'validator'
import Sequence from '../models/sequence.js'
import AuditLog from '../models/auditLog.js'
import Department from '../models/department.js'
import { companyNames } from '../enums/Company.js'
import UserRole from '../enums/UserRole.js'

// 建立角色對照表
const roleNames = {
  [UserRole.USER]: '一般員工',
  [UserRole.ADMIN]: '一般管理者',
  [UserRole.SUPER_ADMIN]: '最高管理者',
  [UserRole.HR]: '人資',
  [UserRole.MANAGER]: '經理',
  [UserRole.ACCOUNTANT]: '會計',
  [UserRole.IT]: 'IT人員'
}

const getNextSequence = async (name) => {
  const sequence = await Sequence.findOneAndUpdate(
    { name },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  )
  return sequence.value
}

export const create = async (req, res) => {
  try {
    const sequenceValue = await getNextSequence('user')
    const userId = `${String(sequenceValue).padStart(4, '0')}`

    // 從請求中提取 department ID
    const { department } = req.body
    const departmentData = await Department.findById(department)

    if (!departmentData) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: '找不到選定的部門' })
    }

    // 使用部門的 companyId 設定用戶的公司欄位
    const result = await User.create({
      ...req.body,
      userId,
      department,
      companyId: departmentData.companyId // 新增用戶的 companyId
    })

    await AuditLog.create({
      operatorId: req.user ? req.user._id : null,
      action: '創建',
      targetId: result._id,
      targetModel: 'users',
      changes: { ...req.body, userId }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '用戶創建成功',
      result
    })
  } catch (error) {
    console.error('Create user error:', error)
    handleError(res, error)
  }
}

// 用戶登入
export const login = async (req, res) => {
  try {
    const token = jwt.sign({ _id: req.user._id }, process.env.JWT_SECRET, { expiresIn: '7 days' })
    req.user.tokens.push(token)
    await req.user.save()
    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: {
        token,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
        userId: req.user.userId
      }
    })
  } catch (error) {
    console.error(error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '未知錯誤'
    })
  }
}

const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'postmessage' // 重要：使用 postmessage 作為重導向 URI
)
// Google 驗證回調
export const googleLogin = async (req, res) => {
  try {
    const { code } = req.body

    // 使用授權碼獲取 tokens
    const { tokens } = await oauth2Client.getToken(code)
    const idToken = tokens.id_token

    // 驗證 ID Token
    const ticket = await oauth2Client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    })

    const payload = ticket.getPayload()
    const email = payload.email

    // 查找用戶
    const user = await User.findOne({ email })
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '此Email尚未註冊,請聯絡人資'
      })
    }

    // 生成 JWT
    const jwtToken = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, {
      expiresIn: '7 days'
    })

    // 保存 token
    user.tokens.push(jwtToken)
    await user.save()

    res.status(200).json({
      success: true,
      message: '登入成功',
      result: {
        token: jwtToken,
        email: user.email,
        name: user.name,
        role: user.role,
        userId: user.userId
      }
    })
  } catch (error) {
    console.error('Google驗證錯誤:', error)
    res.status(500).json({
      success: false,
      message: 'Google驗證失敗',
      error: error.message
    })
  }
}

// 延長用戶登入 token
export const extend = async (req, res) => {
  try {
    const idx = req.user.tokens.findIndex(token => token === req.token)
    const token = jwt.sign({ _id: req.user._id }, process.env.JWT_SECRET, { expiresIn: '7 days' })
    req.user.tokens[idx] = token
    await req.user.save()
    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: token
    })
  } catch (error) {
    handleError(res, error)
  }
}

// 取得當前用戶資料
export const profile = (req, res) => {
  try {
    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: {
        email: req.user.email,
        name: req.user.name,
        role: req.user.role
      }
    })
  } catch (error) {
    handleError(res, error)
  }
}

// 取得所有用戶資料（包含分頁與排序）
export const getAll = async (req, res) => {
  try {
    const itemsPerPage = req.query.itemsPerPage * 1 || 10
    const page = parseInt(req.query.page) || 1
    const regex = new RegExp(req.query.search || '', 'i')
    const roleFilter = req.query.role

    // 基本查詢條件
    const baseMatch = {
      $or: [
        { name: regex },
        { email: regex },
        { userId: regex },
        { cellphone: regex }
      ]
    }

    if (roleFilter !== undefined && roleFilter !== null && roleFilter !== '') {
      baseMatch.role = Number(roleFilter)
    }

    // 處理排序邏輯
    const sortBy = req.query.sortBy || 'userId'
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1

    // 根據不同的排序欄位設定不同的排序邏輯
    switch (sortBy) {
      case 'department.name':
      case 'department.companyId': {
        // 構建 pipeline
        const pipeline = [
          // 首先套用基本查詢條件
          { $match: baseMatch },
          // 關聯部門表
          {
            $lookup: {
              from: 'departments',
              localField: 'department',
              foreignField: '_id',
              as: 'departmentData'
            }
          },
          // Unwind department array
          {
            $unwind: {
              path: '$departmentData',
              preserveNullAndEmptyArrays: true // 保留沒有部門的用戶
            }
          }
        ]

        // 根據排序欄位添加排序條件
        const sortField = sortBy === 'department.name' ? 'departmentData.name' : 'departmentData.companyId'
        pipeline.push({ $sort: { [sortField]: sortOrder } })

        // 計算總數
        const totalItems = await User.countDocuments(baseMatch)

        // 添加分頁
        pipeline.push(
          { $skip: (page - 1) * itemsPerPage },
          { $limit: itemsPerPage }
        )

        // 執行聚合查詢
        const result = await User.aggregate(pipeline)

        // 重新填充部門資訊
        const data = await User.populate(result, {
          path: 'department',
          select: 'name companyId'
        })

        return res.status(StatusCodes.OK).json({
          success: true,
          message: '',
          result: {
            data,
            totalItems,
            itemsPerPage,
            currentPage: page
          }
        })
      }

      default: {
        // 一般欄位的排序
        const sortOption = { [sortBy]: sortOrder }
        const totalItems = await User.countDocuments(baseMatch)

        const data = await User
          .find(baseMatch)
          .populate({
            path: 'department',
            select: 'name companyId'
          })
          .sort(sortOption)
          .skip((page - 1) * itemsPerPage)
          .limit(itemsPerPage)

        return res.status(StatusCodes.OK).json({
          success: true,
          message: '',
          result: {
            data,
            totalItems,
            itemsPerPage,
            currentPage: page
          }
        })
      }
    }
  } catch (error) {
    console.error('Get users error:', error)
    handleError(res, error)
  }
}
// 用戶登出
export const logout = async (req, res) => {
  try {
    req.user.tokens = req.user.tokens.filter(token => token !== req.token)
    await req.user.save()

    res.status(StatusCodes.OK).json({
      success: true,
      message: '登出成功'
    })
  } catch (error) {
    handleError(res, error)
  }
}

// 編輯用戶資料（僅限管理員）
// 在 user controller 中修改 edit 函數
export const edit = async (req, res) => {
  try {
    if (!validator.isMongoId(req.params.id)) throw new Error('ID')

    // 先獲取原始用戶數據，並展開部門資訊
    const originalUser = await User.findById(req.params.id).populate('department')
    if (!originalUser) {
      throw new Error('NOT FOUND')
    }

    const updateData = { ...req.body }
    delete updateData.password
    delete updateData.company

    // 創建一個只包含已更改欄位的物件
    const changedFields = {}
    const auditChanges = {}

    // 處理部門相關的變更
    if (updateData.department && updateData.department !== originalUser.department._id.toString()) {
      // 獲取新的部門資料
      const newDepartment = await Department.findById(updateData.department)
      if (!newDepartment) {
        return res.status(StatusCodes.BAD_REQUEST).json({ message: '找不到選定的部門' })
      }

      // 比較部門名稱是否真的有變更
      if (newDepartment.name !== originalUser.department.name) {
        changedFields.department = updateData.department
        auditChanges.department = {
          from: originalUser.department.name,
          to: newDepartment.name
        }
      }

      // 檢查並記錄公司變更
      const originalCompanyName = companyNames[originalUser.department.companyId]
      const newCompanyName = companyNames[newDepartment.companyId]

      if (newDepartment.companyId !== originalUser.department.companyId) {
        changedFields.companyId = newDepartment.companyId
        auditChanges.company = {
          from: originalCompanyName,
          to: newCompanyName
        }
      }
    }

    // 處理所有其他欄位的變更
    Object.keys(updateData).forEach(key => {
      // 跳過已處理的欄位
      if (['department', 'companyId', 'company'].includes(key)) return

      // 處理日期類型
      if (key === 'birthDate' || key === 'hireDate' || key === 'resignationDate') {
        const originalDate = originalUser[key] ? originalUser[key].toISOString() : null
        const newDate = updateData[key] ? new Date(updateData[key]).toISOString() : null
        if (originalDate !== newDate) {
          changedFields[key] = updateData[key]
          auditChanges[key] = {
            from: originalDate,
            to: newDate
          }
        } // 處理角色欄位
      } else if (key === 'role' && originalUser[key]?.toString() !== updateData[key]?.toString()) {
        changedFields[key] = updateData[key]
        auditChanges[key] = {
          from: roleNames[originalUser[key]] || `未知角色(${originalUser[key]})`,
          to: roleNames[updateData[key]] || `未知角色(${updateData[key]})`
        }
      } else if (originalUser[key]?.toString() !== updateData[key]?.toString()) {
        // 處理其他欄位
        changedFields[key] = updateData[key]
        auditChanges[key] = {
          from: originalUser[key],
          to: updateData[key]
        }
      }
    })

    // 如果有欄位被更改才更新數據
    if (Object.keys(changedFields).length > 0) {
      const user = await User.findByIdAndUpdate(
        req.params.id,
        changedFields,
        { new: true, runValidators: true }
      ).populate('department')

      // 記錄變更
      await AuditLog.create({
        operatorId: req.user._id,
        action: '修改',
        targetId: user._id,
        targetModel: 'users',
        changes: auditChanges
      })

      res.status(StatusCodes.OK).json({
        success: true,
        message: '用戶資料更新成功',
        result: user
      })
    } else {
      res.status(StatusCodes.OK).json({
        success: true,
        message: '沒有欄位被修改',
        result: originalUser
      })
    }
  } catch (error) {
    console.error(error)
    handleError(res, error)
  }
}

// 統一錯誤處理
const handleError = (res, error) => {
  console.error('Error details:', error) // 增加錯誤詳細資訊的日誌
  if (error.name === 'ValidationError') {
    const key = Object.keys(error.errors)[0]
    const message = error.errors[key].message
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message
    })
  } else if (error.name === 'MongoServerError' && error.code === 11000) {
    res.status(StatusCodes.CONFLICT).json({
      success: false,
      message: 'Email、身分證、手機、分機號碼或列印編號已註冊'
    })
  } else if (error.message === 'ID') {
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: '用戶 ID 格式錯誤'
    })
  } else if (error.message === 'NOT FOUND') {
    res.status(StatusCodes.NOT_FOUND).json({
      success: false,
      message: '查無用戶'
    })
  } else {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '未知錯誤'
    })
  }
}
