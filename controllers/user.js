import User from '../models/user.js'
import mongoose from 'mongoose'
import { StatusCodes } from 'http-status-codes'
import { OAuth2Client } from 'google-auth-library'
import jwt from 'jsonwebtoken'
import validator from 'validator'
import AuditLog from '../models/auditLog.js'
import { getNextUserNumber } from '../utils/sequence.js'
import Company from '../models/company.js' // 新增
import { roleNames } from '../enums/UserRole.js'
import Department from '../models/department.js' // 新增
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import nodemailer from 'nodemailer'
import { fileURLToPath } from 'url'
import path, { dirname } from 'path'
import { v2 as cloudinary } from 'cloudinary'

const transporter = nodemailer.createTransport({
  // service: 'Gmail',
  host: 'mail.ys7029.com', // 外寄伺服器主機地址
  port: 465, // SMTP 埠號，465 為 SSL/TLS
  secure: true, // 使用 SSL/TLS
  auth: {
    // user: process.env.EMAIL_USER,
    // pass: process.env.EMAIL_PASS
    user: 'ysphere-eip@ys7029.com', // 您的完整電子郵件地址
    pass: 'Ystravel_0601' // 您的 cPanel 密碼
  }
})

const formatDateForAuditLog = (date) => {
  if (!date) return null
  // 確保是 Date 對象
  const d = new Date(date)
  if (isNaN(d.getTime())) return null

  // 調整為台灣時間 (UTC+8)
  const tzOffset = 8 * 60
  const localDate = new Date(d.getTime() + tzOffset * 60 * 1000)

  // 返回 YYYY-MM-DD 格式的台灣時間
  return localDate.toISOString().split('T')[0]
}

export const create = async (req, res) => {
  console.log('Create user:', req.body)
  try {
    // 工具函數：將空字串轉換為 null
    const normalizeData = (obj) => {
      const normalized = {}
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // 遞迴處理嵌套對象
          normalized[key] = normalizeData(value)
        } else if (typeof value === 'string' && value.trim() === '') {
          // 將空字串轉換為 null
          normalized[key] = null
        } else {
          // 保持其他值不變
          normalized[key] = value
        }
      }
      return normalized
    }

    // 先查詢部門資訊
    const departmentData = await Department.findById(req.body.department)
    if (!departmentData) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: '找不到選定的部門'
      })
    }

    // 使用部門編號生成員工編號
    const userId = await getNextUserNumber(departmentData.departmentId)

    // 從請求中提取公司 ID 和其他資訊
    const { company, department } = req.body
    const companyData = await Company.findById(company)

    const companyName = companyData.name
    const departmentName = departmentData.name

    if (!companyData) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: '找不到選定的公司'
      })
    }

    const randomPassword = crypto.randomBytes(8).toString('hex')

    // 處理請求數據，將空字串轉換為 null
    const normalizedData = normalizeData(req.body)

    const result = await User.create({
      ...normalizedData,
      userId,
      company,
      department,
      password: randomPassword,
      isFirstLogin: true
    })

    // 欄位映射定義
    const fieldMappings = {
      name: '姓名',
      englishName: '英文名',
      IDNumber: '身分證號碼',
      birthDate: '生日',
      gender: '性別',
      personalEmail: '個人Email',
      permanentAddress: '戶籍地址',
      contactAddress: '聯絡地址',
      email: '公司Email',
      phoneNumber: '室內電話',
      cellphone: '手機號碼',
      salary: '基本薪資',
      extNumber: '分機號碼',
      printNumber: '列印編號',
      emergencyName: '緊急聯絡人姓名',
      emergencyPhoneNumber: '緊急聯絡人室內電話',
      emergencyCellphone: '緊急聯絡人手機',
      emergencyRelationship: '緊急聯絡人關係',
      jobTitle: '職稱',
      role: '身分別',
      cowellAccount: '科威帳號',
      cowellPassword: '科威密碼',
      userId: '員工編號',
      employmentStatus: '任職狀態',
      hireDate: '入職日期',
      resignationDate: '離職日期',
      note: '備註',
      healthInsuranceStartDate: '健保加保日期',
      healthInsuranceEndDate: '健保退保日期',
      laborInsuranceStartDate: '勞保加保日期',
      laborInsuranceEndDate: '勞保退保日期',
      salaryBank: '薪轉銀行',
      salaryBankBranch: '薪轉分行',
      salaryAccountNumber: '薪轉帳戶號碼',
      guideLicense: '導遊證',
      tourManager: '旅遊經理人',
      YSRCAccount: 'YSRC帳號',
      YSRCPassword: 'YSRC密碼',
      YS168Account: 'YS168帳號',
      YS168Password: 'YS168密碼',
      disabilityStatus: '身心障礙身份',
      indigenousStatus: '原住民身份',
      voluntaryPensionRate: '勞退自提比率',
      voluntaryPensionStartDate: '勞退自提加保日期',
      voluntaryPensionEndDate: '勞退自提退保日期',
      dependentInsurance: '眷屬保險資料',
      tourismReportDate: '觀光局申報到職日期'
    }

    // 建立 changes 物件
    const changes = {}

    // 定義必填欄位和有預設值的欄位
    const requiredFields = [
      'name', 'IDNumber', 'gender', 'birthDate', 'permanentAddress', 'contactAddress',
      'role', 'hireDate', 'employmentStatus', 'email',
      'disabilityStatus', 'indigenousStatus', 'tourManager', 'guideLicense', 'salaryBank'
    ]

    requiredFields.forEach(field => {
      let value = result[field]

      // 特殊處理 role
      if (field === 'role') {
        value = roleNames[value] || '未知'
      }

      // 特殊處理公司和部門
      if (field === 'company') {
        value = companyName
      } else if (field === 'department') {
        value = departmentName
      }

      // 特殊處理日期
      if (value instanceof Date) {
        value = formatDateForAuditLog(value)
      }

      // 特殊處理導遊證
      if (field === 'guideLicense') {
        const licenseTypes = {
          0: '無',
          1: '華語導遊',
          2: '外語導遊',
          3: '華語領隊',
          4: '外語領隊'
        }

        if (Array.isArray(value)) {
          if (value.length === 0 || (value.length === 1 && value[0] === 0)) {
            value = '無'
          } else {
            value = value.map(type => licenseTypes[type] || '未知').join('、')
          }
        } else {
          value = '無'
        }
      }

      // 特殊處理布林值
      if (typeof value === 'boolean') {
        value = value ? '是' : '否'
      }

      changes[fieldMappings[field]] = {
        from: null,
        to: value
      }
    })

    // 處理其他欄位
    Object.entries(result.toObject()).forEach(([key, value]) => {
      // 排除不需要或已記錄的欄位
      if (
        requiredFields.includes(key) ||
    key === 'formStatus' || key === '_id' || key === '__v' ||
    key === 'password' || key === 'tokens' || key === 'createdAt' ||
    key === 'updatedAt' || key === 'isFirstLogin' || key === 'avatar' ||
    !fieldMappings[key]
      ) {
        return
      }

      // 只記錄有值的欄位
      if (value !== null && value !== undefined && value !== '') {
        // 特殊處理日期格式
        if (value instanceof Date) {
          changes[fieldMappings[key]] = {
            from: null,
            to: new Date(value).toISOString().split('T')[0]
          }
          return
        }

        // 特殊處理眷屬保險資料
        if (key === 'dependentInsurance' && Array.isArray(value)) {
          // 只有當陣列不為空時才記錄
          if (value.length > 0) {
            const formattedDependents = value.map(dep => ({
              姓名: dep.dependentName,
              關係: dep.dependentRelationship,
              生日: formatDateForAuditLog(dep.dependentBirthDate),
              身分證號: dep.dependentIDNumber,
              加保日期: formatDateForAuditLog(dep.dependentInsuranceStartDate),
              退保日期: formatDateForAuditLog(dep.dependentInsuranceEndDate)
            }))
            changes[fieldMappings[key]] = {
              from: null,
              to: formattedDependents
            }
          }
          return
        }

        changes[fieldMappings[key]] = {
          from: null,
          to: value
        }
      }
    })

    changes['所屬公司'] = {
      from: null,
      to: companyName
    }

    changes['部門'] = {
      from: null,
      to: departmentName
    }

    // 創建異動記錄
    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: {
        name: req.user.name,
        userId: req.user.userId
      },
      action: '創建',
      targetId: result._id,
      targetInfo: {
        name: result.name,
        userId: result.userId,
        departmentId: departmentData.departmentId,
        companyId: companyData.companyId
      },
      targetModel: 'users',
      changes
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '用戶創建成功',
      result: {
        ...result.toObject(),
        password: undefined
      }
    })
  } catch (error) {
    console.error('Create user error:', error)
    if (error.name === 'ValidationError') {
      const key = Object.keys(error.errors)[0]
      const message = error.errors[key].message
      res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message
      })
    } else if (error.name === 'MongoServerError' && error.code === 11000) {
      const duplicateKey = Object.keys(error.keyValue)[0]
      let message = ''
      switch (duplicateKey) {
        case 'email':
          message = '公司Email已註冊'
          break
        case 'IDNumber':
          message = '身分證號碼已註冊'
          break
        case 'cellphone':
          message = '手機號碼已註冊'
          break
        case 'extNumber':
          message = '分機號碼已註冊'
          break
        case 'printNumber':
          message = '列印編號已註冊'
          break
        case 'userId':
          message = '員工編號已註冊'
          break
        case 'cowellAccount':
          message = '科威帳號已註冊'
          break
        case 'YSRCAccount':
          message = 'YSRC帳號已註冊'
          break
        case 'YS168Account':
          message = 'YS168帳號已註冊'
          break
        default:
          message = `${duplicateKey} 已被註冊`
      }
      res.status(StatusCodes.CONFLICT).json({
        success: false,
        message
      })
    } else {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: '未知錯誤',
        error: error.message
      })
    }
  }
}
// 用戶登入

export const login = async (req, res) => {
  try {
    if (req.user.employmentStatus !== '在職') {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '此帳號已停用，如有疑問請聯絡人資部門'
      })
    }

    // 先 populate user 对象
    const populatedUser = await User.findById(req.user._id)
      .populate('company', 'name companyId') // 修改這裡,加上 companyId
      .populate('department', 'name departmentId')

    const token = jwt.sign({ _id: populatedUser._id }, process.env.JWT_SECRET, { expiresIn: '10h' })
    populatedUser.tokens.push(token)
    await populatedUser.save()

    if (populatedUser.isFirstLogin) {
      return res.status(StatusCodes.OK).json({
        success: true,
        message: '首次登入,請修改密碼',
        result: {
          token,
          isFirstLogin: true
        }
      })
    }
    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: {
        token,
        name: populatedUser.name,
        englishName: populatedUser.englishName,
        birthDate: populatedUser.birthDate,
        gender: populatedUser.gender,
        IDNumber: populatedUser.IDNumber, // 新增
        cellphone: populatedUser.cellphone,
        phoneNumber: populatedUser.phoneNumber, // 新增
        email: populatedUser.email,
        personalEmail: populatedUser.personalEmail,
        permanentAddress: populatedUser.permanentAddress,
        contactAddress: populatedUser.contactAddress,
        emergencyName: populatedUser.emergencyName,
        emergencyPhoneNumber: populatedUser.emergencyPhoneNumber, // 新增
        emergencyCellphone: populatedUser.emergencyCellphone,
        emergencyRelationship: populatedUser.emergencyRelationship, // 新增
        userId: populatedUser.userId,
        company: populatedUser.company,
        department: populatedUser.department,
        hireDate: populatedUser.hireDate,
        resignationDate: populatedUser.resignationDate, // 新增
        extNumber: populatedUser.extNumber,
        printNumber: populatedUser.printNumber,
        note: populatedUser.note, // 新增
        guideLicense: populatedUser.guideLicense,
        role: populatedUser.role,
        employmentStatus: populatedUser.employmentStatus, // 新增
        jobTitle: populatedUser.jobTitle,
        avatar: populatedUser.avatar,
        cowellAccount: populatedUser.cowellAccount,
        cowellPassword: populatedUser.cowellPassword,
        // 新增欄位
        healthInsuranceStartDate: populatedUser.healthInsuranceStartDate,
        healthInsuranceEndDate: populatedUser.healthInsuranceEndDate,
        laborInsuranceStartDate: populatedUser.laborInsuranceStartDate,
        laborInsuranceEndDate: populatedUser.laborInsuranceEndDate,
        salaryBank: populatedUser.salaryBank,
        salaryBankBranch: populatedUser.salaryBankBranch,
        salaryAccountNumber: populatedUser.salaryAccountNumber,
        tourManager: populatedUser.tourManager,
        YSRCAccount: populatedUser.YSRCAccount,
        YSRCPassword: populatedUser.YSRCPassword,
        YS168Account: populatedUser.YS168Account,
        YS168Password: populatedUser.YS168Password,
        disabilityStatus: populatedUser.disabilityStatus,
        indigenousStatus: populatedUser.indigenousStatus,
        voluntaryPensionRate: populatedUser.voluntaryPensionRate,
        voluntaryPensionStartDate: populatedUser.voluntaryPensionStartDate,
        voluntaryPensionEndDate: populatedUser.voluntaryPensionEndDate,
        dependentInsurance: populatedUser.dependentInsurance,
        tourismReportDate: populatedUser.tourismReportDate
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
  'postmessage'
)
// Google 驗證回調
export const googleLogin = async (req, res) => {
  try {
    const { code } = req.body
    const { tokens } = await oauth2Client.getToken(code)
    const idToken = tokens.id_token
    const ticket = await oauth2Client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    })

    const payload = ticket.getPayload()
    const email = payload.email

    // 修改这里：同时 populate company 和 department
    const user = await User.findOne({ email })
      .populate('company', 'name companyId')
      .populate('department', 'name departmentId')

    if (!user) {
      return res.status(401).json({
        success: false,
        message: '此Email尚未註冊,請聯絡人資部門'
      })
    }

    if (user.isFirstLogin) {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '您是初次登入用戶，請使用初始密碼登入系統'
      })
    }

    if (user.employmentStatus !== '在職') {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '此帳號已停用，如有疑問請聯絡人資部門'
      })
    }

    const jwtToken = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, {
      expiresIn: '10h'
    })

    user.tokens.push(jwtToken)
    await user.save()

    res.status(200).json({
      success: true,
      message: '登入成功',
      result: {
        token: jwtToken,
        name: user.name,
        englishName: user.englishName,
        birthDate: user.birthDate,
        gender: user.gender,
        IDNumber: user.IDNumber, // 新增
        cellphone: user.cellphone,
        phoneNumber: user.phoneNumber, // 新增
        email: user.email,
        personalEmail: user.personalEmail,
        permanentAddress: user.permanentAddress,
        contactAddress: user.contactAddress,
        emergencyName: user.emergencyName,
        emergencyPhoneNumber: user.emergencyPhoneNumber, // 新增
        emergencyCellphone: user.emergencyCellphone,
        emergencyRelationship: user.emergencyRelationship, // 新增
        userId: user.userId,
        company: user.company,
        department: user.department,
        hireDate: user.hireDate,
        resignationDate: user.resignationDate, // 新增
        extNumber: user.extNumber,
        printNumber: user.printNumber,
        note: user.note, // 新增
        guideLicense: user.guideLicense,
        role: user.role,
        employmentStatus: user.employmentStatus, // 新增
        jobTitle: user.jobTitle,
        avatar: user.avatar,
        cowellAccount: user.cowellAccount,
        cowellPassword: user.cowellPassword,
        // 新增欄位
        healthInsuranceStartDate: user.healthInsuranceStartDate,
        healthInsuranceEndDate: user.healthInsuranceEndDate,
        laborInsuranceStartDate: user.laborInsuranceStartDate,
        laborInsuranceEndDate: user.laborInsuranceEndDate,
        salaryBank: user.salaryBank,
        salaryBankBranch: user.salaryBankBranch,
        salaryAccountNumber: user.salaryAccountNumber,
        tourManager: user.tourManager,
        YSRCAccount: user.YSRCAccount,
        YSRCPassword: user.YSRCPassword,
        YS168Account: user.YS168Account,
        YS168Password: user.YS168Password,
        disabilityStatus: user.disabilityStatus,
        indigenousStatus: user.indigenousStatus,
        voluntaryPensionRate: user.voluntaryPensionRate,
        voluntaryPensionStartDate: user.voluntaryPensionStartDate,
        voluntaryPensionEndDate: user.voluntaryPensionEndDate,
        dependentInsurance: user.dependentInsurance,
        tourismReportDate: user.tourismReportDate
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
// export const extend = async (req, res) => {
//   try {
//     // 添加檢查用戶狀態
//     if (req.user.employmentStatus !== '在職') {
//       return res.status(StatusCodes.FORBIDDEN).json({
//         success: false,
//         message: '此帳號已停用，如有疑問請聯絡人資部門'
//       })
//     }

//     const idx = req.user.tokens.findIndex(token => token === req.token)
//     const token = jwt.sign({ _id: req.user._id }, process.env.JWT_SECRET, { expiresIn: '1m' })
//     req.user.tokens[idx] = token
//     await req.user.save()
//     res.status(StatusCodes.OK).json({
//       success: true,
//       message: '',
//       result: token
//     })
//   } catch (error) {
//     handleError(res, error)
//   }
// }

// 取得當前用戶資料
export const profile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('company', 'name companyId') // 修改這裡,加上 companyId
      .populate('department', 'name departmentId')

    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: {
        email: user.email,
        personalEmail: user.personalEmail,
        IDNumber: user.IDNumber,
        gender: user.gender,
        name: user.name,
        englishName: user.englishName,
        cellphone: user.cellphone,
        phoneNumber: user.phoneNumber, // 新增
        salary: user.salary,
        extNumber: user.extNumber,
        birthDate: user.birthDate,
        permanentAddress: user.permanentAddress,
        contactAddress: user.contactAddress,
        department: user.department,
        company: user.company,
        jobTitle: user.jobTitle,
        role: user.role,
        employmentStatus: user.employmentStatus, // 新增
        userId: user.userId,
        hireDate: user.hireDate,
        resignationDate: user.resignationDate, // 新增
        emergencyName: user.emergencyName,
        emergencyPhoneNumber: user.emergencyPhoneNumber, // 新增
        emergencyCellphone: user.emergencyCellphone,
        emergencyRelationship: user.emergencyRelationship, // 新增
        printNumber: user.printNumber,
        note: user.note, // 新增
        guideLicense: user.guideLicense,
        avatar: user.avatar,
        cowellAccount: user.cowellAccount,
        cowellPassword: user.cowellPassword,
        // 新增欄位
        healthInsuranceStartDate: user.healthInsuranceStartDate,
        healthInsuranceEndDate: user.healthInsuranceEndDate,
        laborInsuranceStartDate: user.laborInsuranceStartDate,
        laborInsuranceEndDate: user.laborInsuranceEndDate,
        salaryBank: user.salaryBank,
        salaryBankBranch: user.salaryBankBranch,
        salaryAccountNumber: user.salaryAccountNumber,
        tourManager: user.tourManager,
        YSRCAccount: user.YSRCAccount,
        YSRCPassword: user.YSRCPassword,
        YS168Account: user.YS168Account,
        YS168Password: user.YS168Password,
        disabilityStatus: user.disabilityStatus,
        indigenousStatus: user.indigenousStatus,
        voluntaryPensionRate: user.voluntaryPensionRate,
        voluntaryPensionStartDate: user.voluntaryPensionStartDate,
        voluntaryPensionEndDate: user.voluntaryPensionEndDate,
        dependentInsurance: user.dependentInsurance,
        tourismReportDate: user.tourismReportDate
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
    const query = {}

    // 處理其他查詢條件,保持原有邏輯
    if (req.query.role !== undefined && req.query.role !== '') {
      query.role = Number(req.query.role)
    }

    if (req.query.companyId) {
      query.company = new mongoose.Types.ObjectId(req.query.companyId)
    }

    if (req.query.departmentId) {
      query.department = new mongoose.Types.ObjectId(req.query.departmentId)
    }

    if (req.query.gender) {
      query.gender = req.query.gender
    }

    if (req.query.guideLicense !== undefined) {
      query.guideLicense = req.query.guideLicense === 'true'
    }

    if (req.query.employmentStatus) {
      query.employmentStatus = req.query.employmentStatus
    }

    if (req.query.tourManager !== undefined) {
      query.tourManager = req.query.tourManager === 'true'
    }

    if (req.query.disabilityStatus) {
      query.disabilityStatus = req.query.disabilityStatus
    }

    if (req.query.indigenousStatus !== undefined) {
      query.indigenousStatus = req.query.indigenousStatus === 'true'
    }

    const result = await User.find(query)
      .populate('company', 'name companyId')
      .populate('department', 'name departmentId')
      .sort({ [req.query.sortBy || 'userId']: req.query.sortOrder === 'desc' ? -1 : 1 })
      .skip((page - 1) * itemsPerPage)
      .limit(itemsPerPage)

    const total = await User.countDocuments(query)

    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: {
        data: result,
        totalItems: total,
        itemsPerPage,
        currentPage: page
      }
    })
  } catch (error) {
    console.error('Get users error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '獲取用戶列表時發生錯誤',
      error: error.message
    })
  }
}

export const getSuggestions = async (req, res) => { // 使用在auditLog的查詢user
  try {
    const search = req.query.search || ''

    // 構建搜索條件
    const searchRegex = new RegExp(search, 'i')
    const query = {
      $or: [
        { name: searchRegex },
        { userId: searchRegex },
        { email: searchRegex }
      ]
    }

    // 限制返回數量並只返回必要欄位
    const users = await User.find(query)
      .select('name userId email')
      .limit(10)

    res.status(StatusCodes.OK).json({
      success: true,
      result: users
    })
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '獲取用戶建議失敗',
      error: error.message
    })
  }
}

export const getEmployeeStats = async (req, res) => {
  try {
    // 使用 aggregation pipeline 來獲取所有在職員工的公司分佈
    const companyStats = await User.aggregate([
      {
        $match: {
          employmentStatus: '在職'
        }
      },
      {
        // 關聯 companies 集合
        $lookup: {
          from: 'companies',
          localField: 'company',
          foreignField: '_id',
          as: 'companyInfo'
        }
      },
      {
        // 解構關聯後的陣列
        $unwind: {
          path: '$companyInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        // 按公司分組並計數
        $group: {
          _id: '$company',
          count: { $sum: 1 },
          companyName: { $first: '$companyInfo.name' }
        }
      }
    ])

    // 計算總在職人數
    const totalActive = companyStats.reduce((sum, company) => sum + company.count, 0)

    // 格式化響應數據
    const stats = {
      total: totalActive,
      companies: companyStats.map(stat => ({
        companyId: stat._id,
        companyName: stat.companyName || '未分類',
        count: stat.count
      }))
    }

    res.status(StatusCodes.OK).json({
      success: true,
      result: stats
    })
  } catch (error) {
    console.error('Error getting employee stats:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '獲取員工統計資料失敗',
      error: error.message
    })
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

export const remove = async (req, res) => {
  try {
    if (!validator.isMongoId(req.params.id)) throw new Error('ID')

    const user = await User.findById(req.params.id).populate('department')
    if (!user) {
      throw new Error('NOT FOUND')
    }

    // 刪除用戶
    await user.deleteOne()

    // 記錄刪除操作
    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: {
        name: req.user.name,
        userId: req.user.userId
      },
      action: '刪除',
      targetId: user._id,
      targetInfo: {
        name: user.name,
        userId: user.userId
      },
      targetModel: 'users',
      changes: {
        name: {
          from: user.name,
          to: null
        },
        userId: {
          from: user.userId,
          to: null
        },
        email: {
          from: user.email,
          to: null
        },
        company: {
          from: user.company.name,
          to: null
        },
        employmentStatus: {
          from: user.employmentStatus,
          to: null
        }
      }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '用戶刪除成功'
    })
  } catch (error) {
    console.error('Delete user error:', error)
    handleError(res, error)
  }
}

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    const user = await User.findById(req.user._id)

    // 添加檢查用戶狀態
    if (user.employmentStatus !== '在職') {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '此帳號已停用，如有疑問請聯絡人資部門'
      })
    }

    // 如果不是首次登入,驗證當前密碼
    if (!user.isFirstLogin) {
      if (!bcrypt.compareSync(currentPassword, user.password)) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: '當前密碼輸入錯誤'
        })
      }
    }

    // 驗證新密碼長度
    if (newPassword.length < 8) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '新密碼長度至少需要8個字元'
      })
    }

    // 更新密碼
    user.password = newPassword // mongoose pre save hook 會自動進行 hash
    user.isFirstLogin = false // 修改密碼後設為 false
    await user.save()

    // 記錄密碼變更
    await AuditLog.create({
      operatorId: user._id,
      operatorInfo: { // 加入這個
        name: user.name,
        userId: user.userId
      },
      action: '修改',
      targetId: user._id,
      targetInfo: { // 加入這個
        name: user.name,
        userId: user.userId
      },
      targetModel: 'users',
      changes: {
        description: { // 修改格式
          from: '原密碼',
          to: '新密碼'
        }
      }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '密碼更新成功'
    })
  } catch (error) {
    console.error('Change password error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '密碼更新失敗'
    })
  }
}

// 編輯用戶資料（僅限管理員）
export const edit = async (req, res) => {
  try {
    if (!validator.isMongoId(req.params.id)) throw new Error('ID')

    // 先獲取原始用戶數據，並展開公司和部門資訊
    const originalUser = await User.findById(req.params.id)
      .populate('company', 'name')
      .populate('department', 'name')
    if (!originalUser) {
      throw new Error('NOT FOUND')
    }

    const updateData = { ...req.body }
    delete updateData.password // 禁止直接更新密碼

    // 欄位映射定義
    const fieldMappings = {
      name: '姓名',
      englishName: '英文名',
      IDNumber: '身分證號碼',
      birthDate: '生日',
      gender: '性別',
      personalEmail: '個人Email',
      permanentAddress: '戶籍地址',
      contactAddress: '聯絡地址',
      email: '公司Email',
      phoneNumber: '室內電話',
      cellphone: '手機號碼',
      salary: '基本薪資',
      extNumber: '分機號碼',
      printNumber: '列印編號',
      emergencyName: '緊急聯絡人姓名',
      emergencyPhoneNumber: '緊急聯絡人室內電話',
      emergencyCellphone: '緊急聯絡人手機',
      emergencyRelationship: '緊急聯絡人關係',
      jobTitle: '職稱',
      role: '身分別',
      cowellAccount: '科威帳號',
      cowellPassword: '科威密碼',
      userId: '員工編號',
      employmentStatus: '任職狀態',
      hireDate: '入職日期',
      resignationDate: '離職日期',
      note: '備註',
      healthInsuranceStartDate: '健保加保日期',
      healthInsuranceEndDate: '健保退保日期',
      laborInsuranceStartDate: '勞保加保日期',
      laborInsuranceEndDate: '勞保退保日期',
      salaryBank: '薪轉銀行',
      salaryBankBranch: '薪轉分行',
      salaryAccountNumber: '薪轉帳戶號碼',
      guideLicense: '導遊證',
      tourManager: '旅遊經理人',
      YSRCAccount: 'YSRC帳號',
      YSRCPassword: 'YSRC密碼',
      YS168Account: 'YS168帳號',
      YS168Password: 'YS168密碼',
      disabilityStatus: '身心障礙身份',
      indigenousStatus: '原住民身份',
      voluntaryPensionRate: '勞退自提比率',
      voluntaryPensionStartDate: '勞退自提加保日期',
      voluntaryPensionEndDate: '勞退自提退保日期',
      dependentInsurance: '眷屬保險資料',
      tourismReportDate: '觀光局申報到職日期'
    }

    // 創建變更記錄物件
    const auditChanges = {}

    // if (updateData.formStatus !== undefined && updateData.formStatus !== originalUser.formStatus) {
    //   auditChanges['表單狀態'] = {
    //     from: originalUser.formStatus,
    //     to: updateData.formStatus
    //   }
    // }

    // 檢查公司變更
    if (updateData.company && updateData.company !== originalUser.company?._id.toString()) {
      const newCompany = await Company.findById(updateData.company)
      if (newCompany) {
        auditChanges['所屬公司'] = {
          from: originalUser.company?.name || null,
          to: newCompany.name
        }
      }
    }

    // 檢查部門變更
    if (updateData.department && updateData.department !== originalUser.department?._id.toString()) {
      const newDepartment = await Department.findById(updateData.department)
      if (newDepartment) {
        auditChanges['部門'] = {
          from: originalUser.department?.name || null,
          to: newDepartment.name
        }
      }
    }

    // 檢查每個欄位的變更
    Object.entries(updateData).forEach(([key, newValue]) => {
      // 跳過不需要記錄的欄位
      if (key === 'formStatus' || key === '_id' || key === '__v' ||
          key === 'password' || key === 'tokens' || key === 'createdAt' ||
          key === 'updatedAt' || key === 'isFirstLogin' || key === 'avatar' ||
          key === 'company' || key === 'department' || !fieldMappings[key]) {
        return
      }

      const originalValue = originalUser[key]

      // 處理不同類型的欄位比較
      let hasChanged = false
      let fromValue = null
      let toValue = null

      if (key === 'guideLicense') {
        const licenseTypes = {
          0: '無',
          1: '華語導遊',
          2: '外語導遊',
          3: '華語領隊',
          4: '外語領隊'
        }

        const formatLicenseText = (licenses) => {
          // 加入型別檢查和轉換
          if (!Array.isArray(licenses)) {
            licenses = Array.isArray(newValue) ? newValue : [0]
          }
          if (licenses.length === 0) return '無'
          if (licenses.includes(0)) return '無'
          return licenses.map(type => licenseTypes[type] || '未知類型').join('、')
        }

        const oldValue = formatLicenseText(originalValue)
        const newValue = formatLicenseText(updateData.guideLicense)

        if (oldValue !== newValue) {
          hasChanged = true
          fromValue = oldValue
          toValue = newValue
        }
      } else if (typeof originalValue === 'boolean' || typeof newValue === 'boolean') { // 處理布林值
        if (originalValue !== newValue) {
          hasChanged = true
          fromValue = originalValue ? '是' : '否'
          toValue = newValue ? '是' : '否'
        }
      } else if (originalValue instanceof Date || (typeof newValue === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}\.\d{3}Z)?$/.test(newValue))) {
        // 處理 Date 對象和 'YYYY-MM-DD' 或 'YYYY-MM-DDTHH:mm:ss.sssZ' 格式的字符串
        try {
          const originalDate = originalValue instanceof Date ? originalValue : new Date(originalValue)
          const newDate = typeof newValue === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}\.\d{3}Z)?$/.test(newValue) ? new Date(newValue) : new Date(newValue)

          const fromDateStr = originalDate ? formatDateForAuditLog(originalDate) : null
          const toDateStr = newDate ? formatDateForAuditLog(newDate) : null

          if (fromDateStr !== toDateStr) {
            hasChanged = true
            fromValue = fromDateStr
            toValue = toDateStr
          }
        } catch (error) {
          console.error('日期處理錯誤:', error, '欄位:', key)
          // 如果日期格式錯誤，跳過這個欄位
          return
        }
      } else if (key === 'dependentInsurance') {
        const formatDependentForAuditLog = (dep) => {
          if (!dep) return null
          return {
            姓名: dep.dependentName,
            關係: dep.dependentRelationship,
            生日: formatDateForAuditLog(dep.dependentBirthDate),
            身分證號: dep.dependentIDNumber,
            加保日期: formatDateForAuditLog(dep.dependentInsuranceStartDate),
            退保日期: formatDateForAuditLog(dep.dependentInsuranceEndDate)
          }
        }

        const originalDeps = Array.isArray(originalValue) && originalValue.length > 0
          ? originalValue.map(formatDependentForAuditLog).filter(Boolean)
          : null

        const newDeps = Array.isArray(newValue) && newValue.length > 0
          ? newValue.map(formatDependentForAuditLog).filter(Boolean)
          : null

        // 只比較有效的值
        if (JSON.stringify(originalDeps) !== JSON.stringify(newDeps)) {
          hasChanged = true
          fromValue = originalDeps
          toValue = newDeps
        }
      } else if (key === 'role') { // 處理身分別
        const originalRoleName = roleNames[originalValue]
        const newRoleName = roleNames[newValue]

        if (originalRoleName !== newRoleName) {
          hasChanged = true
          fromValue = originalRoleName
          toValue = newRoleName
        }
      } else {
        if (originalValue?.toString() !== newValue?.toString()) { // 處理一般欄位
          hasChanged = true
          fromValue = originalValue || null
          toValue = newValue || null
        }
      }

      // 只記錄有變更且不是從 null/空值變成 null/空值的欄位
      if (hasChanged && !(
        (fromValue === null || fromValue === '' || fromValue === undefined) &&
        (toValue === null || toValue === '' || toValue === undefined)
      )) {
        auditChanges[fieldMappings[key]] = {
          from: fromValue,
          to: toValue
        }
      }
    })

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('company', 'name')
      .populate('department', 'name')

    // 如果有欄位被更改才更新數據和創建審計記錄
    if (Object.keys(auditChanges).length > 0) {
      // 記錄變更到 AuditLog
      await AuditLog.create({
        operatorId: req.user._id,
        operatorInfo: {
          name: req.user.name,
          userId: req.user.userId
        },
        action: '修改',
        targetId: updatedUser._id,
        targetInfo: {
          name: updatedUser.name,
          userId: updatedUser.userId
        },
        targetModel: 'users',
        changes: auditChanges
      })

      res.status(StatusCodes.OK).json({
        success: true,
        message: Object.keys(auditChanges).length > 0 ? '用戶資料更新成功' : '沒有欄位被修改',
        result: updatedUser
      })
    } else {
      res.status(StatusCodes.OK).json({
        success: true,
        message: '沒有欄位被修改',
        result: originalUser
      })
    }
  } catch (error) {
    console.error('Edit user error:', error)

    if (error.name === 'ValidationError') {
      const key = Object.keys(error.errors)[0]
      const message = error.errors[key].message
      res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message
      })
    } else if (error.name === 'MongoServerError' && error.code === 11000) {
      let message = ''
      if (error.keyValue.email) {
        message = 'Email已註冊'
      } else if (error.keyValue.IDNumber) {
        message = '身分證號碼已註冊'
      } else if (error.keyValue.cellphone) {
        message = '手機號碼已註冊'
      } else if (error.keyValue.extNumber) {
        message = '分機號碼已註冊'
      } else if (error.keyValue.printNumber) {
        message = '列印編號已註冊'
      } else if (error.keyValue.userId) {
        message = '員工編號已註冊'
      } else if (error.keyValue.cowellAccount) {
        message = '科威帳號已註冊'
      } else {
        message = '某些欄位值已註冊'
      }
      res.status(StatusCodes.CONFLICT).json({
        success: false,
        message
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
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 發送重置密碼郵件
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body
    const user = await User.findOne({ email })

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '此電子郵件未註冊'
      })
    }

    // 加入初次登入判斷
    if (user.isFirstLogin) {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '您是初次登入用戶，請使用初始密碼登入系統'
      })
    }

    // 檢查用戶狀態
    if (user.employmentStatus !== '在職') {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '此帳號已停用，如有疑問請聯絡人資部門'
      })
    }

    const currentDate = new Date()

    // 檢查上次發送郵件的時間
    if (user.lastEmailSent) {
      const timeSinceLastEmail = currentDate - user.lastEmailSent
      const fiveMinutes = 5 * 60 * 1000 // 5分鐘轉換為毫秒

      if (timeSinceLastEmail < fiveMinutes) {
        const waitTimeSeconds = Math.ceil((fiveMinutes - timeSinceLastEmail) / 1000)
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: `請等待 ${waitTimeSeconds} 秒後再試`
        })
      }
    }

    // 生成重置 token
    const resetToken = crypto.randomBytes(32).toString('hex')

    // 更新用戶資料
    user.resetPasswordToken = resetToken
    user.resetPasswordExpires = new Date(currentDate.getTime() + (30 * 60 * 1000)) // 30分鐘後過期
    user.lastEmailSent = currentDate // 記錄發送時間

    await user.save()

    const resetUrl = `${process.env.FRONTEND_URL}/#/reset-password/${resetToken}`

    const mailOptions = {
      from: 'ysphere-eip@ys7029.com',
      to: user.email,
      subject: 'Ysphere - 永信星球 密碼重置請求',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #333;">密碼重置請求</h2>
          </div>
          
          <div style="background: #f7f7f7; padding: 28px; border-radius: 5px; margin-bottom: 20px;">
            <p style="margin-top: 0; font-size: 14px; font-weight: 600">${user.name} 您好，</p>
            <p style="font-size: 14px; font-weight: 500">我們收到了您的密碼重置請求。請點擊下方連結重置您的密碼：</p>
            <div style="text-align: center; margin: 40px 0;">
              <a href="${resetUrl}" 
                  style="background: #495866; color: white; padding: 12px 24px; 
                        text-decoration: none; letter-spacing:2px; font-size:14px; border-radius: 5px; display: inline-block;">
                重置密碼
              </a>
            </div>
            <p style="color: #666; font-size: 13px;">
              此連結將在30分鐘後失效。<br>
            </p>
            <p style="color: #666; font-size: 13px;">
              如果您沒有請求重置密碼，請忽略此郵件。
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <p>感謝您的使用！</p>
            <p style="color: #666; margin-bottom: 20px;">Ysphere EIP System</p>
            <img src="cid:logo" alt="YSTravel Logo" style="max-width: 150px; height: auto;">
          </div>

          <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
            <p>此為系統自動發送的郵件，請勿直接回覆</p>
          </div>
        </div>
      `,
      attachments: [{
        filename: 'logo.png',
        path: path.join(__dirname, '../public/images/logo_horizontal.png'), // 請確保這個路徑指向你的 logo 圖片
        cid: 'logo' // 這個 ID 需要和 HTML 中的 cid 匹配
      }]
    }

    await transporter.sendMail(mailOptions)

    res.status(StatusCodes.OK).json({
      success: true,
      message: '重置密碼郵件已發送，請檢查您的信箱'
    })
  } catch (error) {
    console.error('忘記密碼錯誤:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '發送重置郵件時發生錯誤'
    })
  }
}
// 重置密碼
// 在 controller 中修改 resetPassword 函數
export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body

    // 使用 lean() 獲取純 JavaScript 物件
    const user = await User.findOne({
      resetPasswordToken: token
    }).lean()

    if (!user || !user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '重置連結無效或已過期'
      })
    }

    // 檢查用戶狀態
    if (user.employmentStatus !== '在職') {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '此帳號已停用，如有疑問請聯絡人資部門'
      })
    }

    // 驗證新密碼長度
    if (newPassword.length < 8) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '新密碼長度至少需要8個字元'
      })
    }

    // 更新使用者資料
    const updatedUser = await User.findByIdAndUpdate(user._id, {
      $set: {
        password: bcrypt.hashSync(newPassword, 10)
      },
      $unset: {
        resetPasswordToken: 1,
        resetPasswordExpires: 1,
        lastEmailSent: 1
      }
    }, { new: true })

    // 記錄密碼重置
    await AuditLog.create({
      operatorId: updatedUser._id,
      operatorInfo: { // 加入這個
        name: updatedUser.name,
        userId: updatedUser.userId
      },
      action: '修改',
      targetId: updatedUser._id,
      targetInfo: { // 加入這個
        name: updatedUser.name,
        userId: updatedUser.userId
      },
      targetModel: 'users',
      changes: {
        description: { // 修改格式
          from: '舊密碼',
          to: '透過郵件重置的新密碼'
        }
      }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '密碼重置成功，請使用新密碼登入'
    })
  } catch (error) {
    console.error('重置密碼錯誤:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '重置密碼時發生錯誤'
    })
  }
}

// 更新用戶頭像
export const updateAvatar = async (req, res) => {
  try {
    if (!req.file || !req.file.path) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '未提供頭像文件'
      })
    }

    const user = await User.findById(req.user._id)
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到用戶'
      })
    }

    // 如果用戶有舊頭像且不是默認頭像，則刪除
    if (user.avatar && !user.avatar.includes('multiavatar')) {
      // 從 Cloudinary URL 中提取 public_id
      const publicId = user.avatar.split('/').pop().split('.')[0]
      try {
        await cloudinary.uploader.destroy(`avatars/${publicId}`)
      } catch (error) {
        console.error('刪除舊頭像失敗:', error)
        // 即使刪除舊頭像失敗，我們仍然繼續更新新頭像
      }
    }

    user.avatar = req.file.path // 更新用戶的頭像URL
    await user.save()

    res.status(StatusCodes.OK).json({
      success: true,
      message: '頭像更新成功',
      result: user.avatar
    })
  } catch (error) {
    console.error('更新頭像錯誤:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '更新頭像失敗'
    })
  }
}

// 新增發送初始密碼的功能
export const sendInitialPassword = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到該用戶'
      })
    }

    if (!user.isFirstLogin) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '該用戶已完成首次登入'
      })
    }

    // 生成新的隨機密碼
    const randomPassword = crypto.randomBytes(8).toString('hex')
    user.password = randomPassword
    await user.save()

    // 發送郵件
    const mailOptions = {
      from: 'ysphere-eip@ys7029.com',
      to: user.email,
      subject: 'Ysphere - 永信星球 系統初始密碼',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #333;">系統初始密碼</h2>
          </div>
          
          <div style="background: #f7f7f7; padding: 28px; border-radius: 5px; margin-bottom: 20px;">
            <p style="margin-top: 0; font-size: 14px; font-weight: 600">${user.name} 您好，</p>
            <p style="font-size: 14px; font-weight: 500">這是您的系統初始密碼：</p>
            <div style="text-align: center; margin: 20px 0;">
              <div style="background: #eee; padding: 12px; border-radius: 4px; font-size: 18px; font-family: monospace;">
                ${randomPassword}
              </div>
            </div>
            <p style="color: #666; font-size: 13px;">
              請使用此密碼進行首次登入，系統會要求您立即修改密碼。
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #666; margin-bottom: 20px;">Ysphere EIP System</p>
            <img src="cid:logo" alt="Ysphere LOGO" style="max-width: 150px; height: auto;">
          </div>

          <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
            <p>此為系統自動發送的郵件，請勿直接回覆</p>
          </div>
        </div>
      `,
      attachments: [{
        filename: 'logo.png',
        path: path.join(__dirname, '../public/images/logo_horizontal.png'), // 請確保這個路徑指向你的 logo 圖片
        cid: 'logo' // 這個 ID 需要和 HTML 中的 cid 匹配
      }]
    }

    await transporter.sendMail(mailOptions)

    res.status(StatusCodes.OK).json({
      success: true,
      message: '初始密碼已發送成功'
    })
  } catch (error) {
    console.error('發送初始密碼錯誤:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '發送初始密碼失敗'
    })
  }
}

export const revealSystem = async (req, res) => {
  try {
    const { password } = req.body

    // 驗證用戶輸入的密碼
    const user = await User.findById(req.user._id)
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到用戶'
      })
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '密碼錯誤'
      })
    }

    // 返回科威帳號和密碼
    res.status(StatusCodes.OK).json({
      success: true,
      message: '驗證成功',
      result: {
        cowellAccount: user.cowellAccount,
        cowellPassword: user.cowellPassword
      }
    })
  } catch (error) {
    console.error('Reveal Cowell error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '無法查看科威帳號和密碼'
    })
  }
}

export const search = async (req, res) => {
  try {
    const itemsPerPage = req.query.itemsPerPage * 1 || 10
    const page = parseInt(req.query.page) || 1
    const query = {}

    // 只有當有指定查詢參數時才加入查詢條件
    if (req.query.role) {
      query.role = Number(req.query.role)
    }
    if (req.query.companyId) {
      query.company = new mongoose.Types.ObjectId(req.query.companyId)
    }
    if (req.query.department) {
      query.department = new mongoose.Types.ObjectId(req.query.department)
    }
    if (req.query.gender) {
      query.gender = req.query.gender
    }
    if (req.query.employmentStatus) {
      query.employmentStatus = req.query.employmentStatus
    }
    if (req.query.guideLicense) {
      const licenseNumber = parseInt(req.query.guideLicense)
      query.guideLicense = { $in: [licenseNumber] }
    }
    if (req.query.disabilityStatus) {
      query.disabilityStatus = req.query.disabilityStatus
    }
    if (req.query.formStatus) {
      query.formStatus = req.query.formStatus
    }

    // 只有當有明確的 是/否 值時才加入查詢條件
    if (req.query.indigenousStatus !== undefined) {
      // 使用 JSON.parse 來正確解析字串 "true"/"false" 為 Boolean
      query.indigenousStatus = JSON.parse(req.query.indigenousStatus)
    }

    if (req.query.tourManager !== undefined) {
      query.tourManager = JSON.parse(req.query.tourManager)
    }

    // 處理日期範圍查詢
    if (req.query.dateType && req.query.startDate && req.query.endDate) {
      const startDate = new Date(req.query.startDate)
      const endDate = new Date(req.query.endDate)
      if (startDate.toDateString() === endDate.toDateString()) {
        endDate.setHours(23, 59, 59, 999)
      }
      query[req.query.dateType] = { $gte: startDate, $lte: endDate }
    }

    // 處理快速搜尋
    if (req.query.quickSearch) {
      const searchRegex = new RegExp(req.query.quickSearch, 'i')
      query.$or = [
        { name: searchRegex },
        { userId: searchRegex },
        { email: searchRegex },
        { cellphone: searchRegex },
        { extNumber: searchRegex },
        { personalEmail: searchRegex },
        { IDNumber: searchRegex },
        { permanentAddress: searchRegex },
        { contactAddress: searchRegex },
        { note: searchRegex }
      ]
    }

    const sortField = req.query.sortBy || 'userId'
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1

    const pipeline = [
      { $match: query },
      {
        $lookup: {
          from: 'companies',
          localField: 'company',
          foreignField: '_id',
          as: 'company'
        }
      },
      { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'departments',
          localField: 'department',
          foreignField: '_id',
          as: 'department'
        }
      },
      { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } },
      { $sort: { [sortField]: sortOrder } },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [{ $skip: (page - 1) * itemsPerPage }, { $limit: itemsPerPage }]
        }
      }
    ]

    const [result] = await User.aggregate(pipeline)

    const totalCount = result.metadata[0]?.total || 0
    const data = result.data

    console.log('Total matching documents:', totalCount)

    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: {
        data,
        totalItems: totalCount,
        itemsPerPage,
        currentPage: page
      }
    })
  } catch (error) {
    console.error('Search users error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '搜索用戶時發生錯誤',
      error: error.message
    })
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
      message: 'Email、身分證、手機、分機號碼、列印編號或員工編號已註冊'
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

// 修改控制器函數 - 提供所有員工可查看的基本資料
export const getBasicInfo = async (req, res) => {
  try {
    const users = await User.find(
      {}, // 不限制查詢條件,讓前端組件自行過濾
      {
        name: 1, // 姓名
        englishName: 1, // 英文名
        userId: 1, // 員工編號
        department: 1, // 部門
        company: 1, // 公司
        extNumber: 1, // 分機號碼
        birthDate: 1, // 生日
        cellphone: 1, // 手機
        employmentStatus: 1, // 在職狀態
        avatar: 1 // 大頭貼
      }
    )
      .populate('company', 'name companyId')
      .populate('department', 'name departmentId')

    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: {
        data: users
      }
    })
  } catch (error) {
    console.error('Get basic info error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '獲取基本資料時發生錯誤',
      error: error.message
    })
  }
}
