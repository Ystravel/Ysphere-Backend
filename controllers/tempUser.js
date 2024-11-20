import TempUser from '../models/tempUser.js'
import User from '../models/user.js'
import { StatusCodes } from 'http-status-codes'
import mongoose from 'mongoose'
import AuditLog from '../models/auditLog.js'
import { getNextUserNumber } from '../utils/sequence.js'
import crypto from 'crypto'

// 定義臨時資料到正式資料的欄位映射關係
const FIELD_MAPPING = {
  // 完全相同的欄位 - 直接複製
  name: 'name',
  englishName: 'englishName',
  IDNumber: 'IDNumber',
  gender: 'gender',
  cellphone: 'cellphone',
  birthDate: 'birthDate',
  permanentAddress: 'permanentAddress',
  contactAddress: 'contactAddress',
  emergencyName: 'emergencyName',
  emergencyCellphone: 'emergencyCellphone',
  emergencyRelationship: 'emergencyRelationship',

  // 需要改名的欄位
  plannedCompany: 'company',
  plannedDepartment: 'department',
  plannedJobTitle: 'jobTitle',
  plannedSalary: 'salary',
  plannedExtNumber: 'extNumber'
}

// 創建臨時員工資料
export const create = async (req, res) => {
  try {
    const data = {
      ...req.body,
      createdBy: req.user._id,
      lastModifiedBy: req.user._id
    }

    const result = await TempUser.create(data)

    // 記錄審計日誌
    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: {
        name: req.user.name,
        userId: req.user.userId
      },
      action: '創建',
      targetId: result._id,
      targetInfo: {
        name: result.name
      },
      targetModel: 'tempUsers',
      changes: {
        name: {
          from: null,
          to: result.name
        },
        status: {
          from: null,
          to: result.status
        }
      }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '臨時員工資料創建成功',
      result
    })
  } catch (error) {
    console.error('Create temp user error:', error)
    if (error.name === 'ValidationError') {
      const key = Object.keys(error.errors)[0]
      const message = error.errors[key].message
      res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message
      })
    } else if (error.name === 'MongoServerError' && error.code === 11000) {
      let message = ''
      if (error.keyValue.personalEmail) {
        message = 'Email已註冊'
      } else {
        message = '某些欄位值已註冊'
      }
      res.status(StatusCodes.CONFLICT).json({
        success: false,
        message
      })
    } else {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: '未知錯誤'
      })
    }
  }
}

// 取得所有臨時員工資料（包含分頁與排序）
export const getAll = async (req, res) => {
  try {
    const itemsPerPage = req.query.itemsPerPage * 1 || 10
    const page = parseInt(req.query.page) || 1
    const query = {}

    // 處理日期查詢
    if (req.query.startDate && req.query.endDate) {
      const startDate = new Date(req.query.startDate)
      const endDate = new Date(req.query.endDate)
      startDate.setHours(0, 0, 0, 0)
      endDate.setHours(23, 59, 59, 999)
      query.effectiveDate = {
        $gte: startDate,
        $lte: endDate
      }
    }

    // 處理狀態查詢
    if (req.query.status) {
      query.status = req.query.status
    }

    // 處理公司查詢
    if (req.query.companyId) {
      query.plannedCompany = new mongoose.Types.ObjectId(req.query.companyId)
    }

    // 處理部門查詢
    if (req.query.departmentId) {
      query.plannedDepartment = new mongoose.Types.ObjectId(req.query.departmentId)
    }

    // 處理快速搜尋
    if (req.query.quickSearch) {
      const searchRegex = new RegExp(req.query.quickSearch, 'i')
      query.$or = [
        { name: searchRegex },
        { personalEmail: searchRegex },
        { cellphone: searchRegex },
        { plannedExtNumber: searchRegex }
      ]
    }

    const result = await TempUser.find(query)
      .populate('plannedCompany', 'name')
      .populate('plannedDepartment', 'name')
      .populate('createdBy', 'name userId')
      .populate('lastModifiedBy', 'name userId')
      .sort({ [req.query.sortBy || 'createdAt']: req.query.sortOrder === 'desc' ? -1 : 1 })
      .skip((page - 1) * itemsPerPage)
      .limit(itemsPerPage)

    const total = await TempUser.countDocuments(query)

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
    console.error('Get temp users error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '獲取臨時員工列表失敗'
    })
  }
}

// 編輯臨時員工資料
export const edit = async (req, res) => {
  try {
    const tempUser = await TempUser.findById(req.params.id)
    if (!tempUser) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到臨時員工資料'
      })
    }

    const updateData = {
      ...req.body,
      lastModifiedBy: req.user._id
    }

    const result = await TempUser.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('plannedCompany', 'name')
      .populate('plannedDepartment', 'name')

    // 記錄變更
    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: {
        name: req.user.name,
        userId: req.user.userId
      },
      action: '修改',
      targetId: result._id,
      targetInfo: {
        name: result.name
      },
      targetModel: 'tempUsers',
      changes: {
        name: {
          from: tempUser.name,
          to: result.name
        },
        status: {
          from: tempUser.status,
          to: result.status
        }
      }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '臨時員工資料更新成功',
      result
    })
  } catch (error) {
    console.error('Edit temp user error:', error)
    if (error.name === 'ValidationError') {
      const key = Object.keys(error.errors)[0]
      const message = error.errors[key].message
      res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message
      })
    } else {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: '更新臨時員工資料失敗'
      })
    }
  }
}

// 刪除臨時員工資料
export const remove = async (req, res) => {
  try {
    const tempUser = await TempUser.findById(req.params.id)
    if (!tempUser) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到臨時員工資料'
      })
    }

    await tempUser.deleteOne()

    // 記錄刪除操作
    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: {
        name: req.user.name,
        userId: req.user.userId
      },
      action: '刪除',
      targetId: tempUser._id,
      targetInfo: {
        name: tempUser.name
      },
      targetModel: 'tempUsers',
      changes: {
        status: {
          from: tempUser.status,
          to: null
        }
      }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '臨時員工資料刪除成功'
    })
  } catch (error) {
    console.error('Delete temp user error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '刪除臨時員工資料失敗'
    })
  }
}

// 轉換為正式員工
export const convertToFormalUser = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const { tempUserId } = req.params

    // 查找臨時員工資料
    const tempUser = await TempUser.findById(tempUserId)
      .populate('plannedCompany')
      .populate('plannedDepartment')

    if (!tempUser) {
      throw new Error('找不到臨時員工資料')
    }

    // 生成新的員工編號
    const userId = await getNextUserNumber()

    // 準備正式員工資料
    const formalUserData = {
      userId,
      email: `${userId}@yourdomain.com`, // 根據公司郵件規則生成
      employmentStatus: '在職',
      role: 1, // 一般用戶角色
      password: crypto.randomBytes(8).toString('hex'), // 生成隨機初始密碼
      isFirstLogin: true
    }

    // 根據映射關係複製資料
    for (const [tempField, formalField] of Object.entries(FIELD_MAPPING)) {
      if (tempUser[tempField] !== undefined && tempUser[tempField] !== null) {
        formalUserData[formalField] = tempUser[tempField]
      }
    }

    // 使用 session 創建正式員工資料
    const newUser = new User(formalUserData)
    await newUser.save({ session })

    // 更新臨時員工資料狀態
    tempUser.status = '已處理'
    tempUser.lastModifiedBy = req.user._id
    await tempUser.save({ session })

    // 記錄審計日誌
    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: {
        name: req.user.name,
        userId: req.user.userId
      },
      action: '轉換為正式員工',
      targetId: tempUser._id,
      targetInfo: {
        name: tempUser.name,
        newUserId: userId
      },
      targetModel: 'tempUsers',
      changes: {
        status: {
          from: tempUser.status,
          to: '已處理'
        },
        // 添加更多詳細的變更記錄
        convertedToUser: {
          from: false,
          to: true
        },
        formalUserId: {
          from: null,
          to: newUser._id.toString()
        }
      }
    }, { session })

    await session.commitTransaction()

    res.status(StatusCodes.OK).json({
      success: true,
      message: '成功轉換為正式員工',
      result: {
        _id: newUser._id,
        userId,
        initialPassword: formalUserData.password,
        email: formalUserData.email,
        name: newUser.name
      }
    })
  } catch (error) {
    await session.abortTransaction()
    console.error('Convert to formal user error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || '轉換失敗'
    })
  } finally {
    session.endSession()
  }
}
