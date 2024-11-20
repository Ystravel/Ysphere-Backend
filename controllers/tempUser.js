import TempUser from '../models/tempUser.js'
import { StatusCodes } from 'http-status-codes'
import mongoose from 'mongoose'
import validator from 'validator'
import AuditLog from '../models/auditLog.js'

// 建立臨時員工資料
export const create = async (req, res) => {
  try {
    const result = await TempUser.create({
      ...req.body,
      createdBy: req.user._id
    })

    // 記錄操作日誌
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
      message: '臨時員工資料建立成功',
      result
    })
  } catch (error) {
    console.error('Create temp user error:', error)
    handleError(res, error)
  }
}

// 取得所有臨時員工資料
export const getAll = async (req, res) => {
  try {
    const itemsPerPage = req.query.itemsPerPage * 1 || 10
    const page = parseInt(req.query.page) || 1
    const query = {}

    // 處理篩選條件
    if (req.query.status) {
      query.status = req.query.status
    }
    if (req.query.companyId) {
      query.company = new mongoose.Types.ObjectId(req.query.companyId)
    }
    if (req.query.departmentId) {
      query.department = new mongoose.Types.ObjectId(req.query.departmentId)
    }

    // 處理快速搜尋
    if (req.query.quickSearch) {
      const searchRegex = new RegExp(req.query.quickSearch, 'i')
      query.$or = [
        { name: searchRegex },
        { personalEmail: searchRegex },
        { cellphone: searchRegex }
      ]
    }

    const result = await TempUser.find(query)
      .populate('company', 'name')
      .populate('department', 'name')
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
    handleError(res, error)
  }
}

// 編輯臨時員工資料
export const edit = async (req, res) => {
  try {
    if (!validator.isMongoId(req.params.id)) throw new Error('ID')

    const tempUser = await TempUser.findById(req.params.id)
      .populate('company', 'name')
      .populate('department', 'name')

    if (!tempUser) {
      throw new Error('NOT FOUND')
    }

    if (tempUser.isTransferred) {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '此臨時員工資料已轉為正式員工，無法修改'
      })
    }

    const updateData = { ...req.body, lastModifiedBy: req.user._id }

    // 建立變更記錄
    const changes = {}
    for (const [key, value] of Object.entries(updateData)) {
      if (tempUser[key]?.toString() !== value?.toString()) {
        changes[key] = {
          from: tempUser[key],
          to: value
        }
      }
    }

    const result = await TempUser.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('company department')

    // 記錄變更
    if (Object.keys(changes).length > 0) {
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
        changes
      })
    }

    res.status(StatusCodes.OK).json({
      success: true,
      message: '臨時員工資料更新成功',
      result
    })
  } catch (error) {
    console.error('Edit temp user error:', error)
    handleError(res, error)
  }
}

// 刪除臨時員工資料
export const remove = async (req, res) => {
  try {
    if (!validator.isMongoId(req.params.id)) throw new Error('ID')

    const tempUser = await TempUser.findById(req.params.id)
    if (!tempUser) {
      throw new Error('NOT FOUND')
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
        name: {
          from: tempUser.name,
          to: null
        },
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
    handleError(res, error)
  }
}

// 取得特定臨時員工資料
export const getById = async (req, res) => {
  try {
    if (!validator.isMongoId(req.params.id)) throw new Error('ID')

    const result = await TempUser.findById(req.params.id)
      .populate('company', 'name')
      .populate('department', 'name')
      .populate('createdBy', 'name userId')
      .populate('lastModifiedBy', 'name userId')

    if (!result) {
      throw new Error('NOT FOUND')
    }

    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result
    })
  } catch (error) {
    console.error('Get temp user error:', error)
    handleError(res, error)
  }
}

// 標記臨時員工資料已轉為正式
export const markAsTransferred = async (req, res) => {
  try {
    if (!validator.isMongoId(req.params.id)) throw new Error('ID')

    const tempUser = await TempUser.findById(req.params.id)
    if (!tempUser) {
      throw new Error('NOT FOUND')
    }

    if (tempUser.isTransferred) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '此臨時員工資料已經轉為正式員工'
      })
    }

    const result = await TempUser.findByIdAndUpdate(
      req.params.id,
      {
        isTransferred: true,
        status: '已完成',
        lastModifiedBy: req.user._id
      },
      { new: true }
    )

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
        isTransferred: {
          from: false,
          to: true
        },
        status: {
          from: tempUser.status,
          to: '已完成'
        }
      }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '已標記為正式員工',
      result
    })
  } catch (error) {
    console.error('Mark as transferred error:', error)
    handleError(res, error)
  }
}

export const getFormattedForTransfer = async (req, res) => {
  try {
    const tempUser = await TempUser.findById(req.params.id)
      .populate('company')
      .populate('department')

    if (!tempUser || tempUser.status !== '待入職') {
      throw new Error('NOT_READY_FOR_TRANSFER')
    }

    // 格式化資料以符合正式員工格式
    const formattedData = {
      name: tempUser.name,
      englishName: tempUser.englishName,
      gender: tempUser.gender,
      IDNumber: tempUser.IDNumber,
      cellphone: tempUser.cellphone,
      birthDate: tempUser.birthDate,
      permanentAddress: tempUser.permanentAddress,
      contactAddress: tempUser.contactAddress,
      emergencyName: tempUser.emergencyName,
      emergencyCellphone: tempUser.emergencyCellphone,
      emergencyRelationship: tempUser.emergencyRelationship,
      company: tempUser.company?._id,
      department: tempUser.department?._id,
      jobTitle: tempUser.jobTitle,
      salary: tempUser.salary,
      extNumber: tempUser.extNumber,
      hireDate: tempUser.effectiveDate // 生效日期轉為入職日期
    }

    res.status(StatusCodes.OK).json({
      success: true,
      result: formattedData
    })
  } catch (error) {
    handleError(res, error)
  }
}

export const updateAfterTransfer = async (req, res) => {
  try {
    const { tempUserId, userId } = req.params // userId 是新建立的正式員工 ID

    const result = await TempUser.findByIdAndUpdate(
      tempUserId,
      {
        isTransferred: true,
        status: '已完成',
        lastModifiedBy: req.user._id
      },
      { new: true }
    )

    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: { name: req.user.name, userId: req.user.userId },
      action: '轉為正式',
      targetId: result._id,
      targetInfo: { name: result.name },
      targetModel: 'tempUsers',
      changes: {
        status: { from: '待入職', to: '已完成' },
        isTransferred: { from: false, to: true },
        associatedUserId: { from: null, to: userId }
      }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '臨時員工資料已更新為已轉換狀態'
    })
  } catch (error) {
    handleError(res, error)
  }
}

// 統一錯誤處理
const handleError = (res, error) => {
  if (error.name === 'ValidationError') {
    const key = Object.keys(error.errors)[0]
    const message = error.errors[key].message
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message
    })
  } else if (error.message === 'ID') {
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: '資料 ID 格式錯誤'
    })
  } else if (error.message === 'NOT FOUND') {
    res.status(StatusCodes.NOT_FOUND).json({
      success: false,
      message: '找不到資料'
    })
  } else {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '未知錯誤'
    })
  }
}
