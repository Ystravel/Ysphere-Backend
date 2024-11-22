import TempUser from '../models/tempUser.js'
import { StatusCodes } from 'http-status-codes'
import mongoose from 'mongoose'
import validator from 'validator'
import AuditLog from '../models/auditLog.js'
import Company from '../models/company.js'
import Department from '../models/department.js'

// 建立臨時員工資料
export const create = async (req, res) => {
  try {
    // 從請求中提取公司和部門 ID
    const { company, department } = req.body

    let companyData, departmentData

    // 如果提供了公司 ID,則查詢完整的公司資料
    if (company) {
      companyData = await Company.findById(company)
      if (!companyData) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: '找不到選定的公司'
        })
      }
    }

    // 如果提供了部門 ID,則查詢完整的部門資料
    if (department) {
      departmentData = await Department.findById(department)
      if (!departmentData) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: '找不到選定的部門'
        })
      }
    }

    // 創建招聘資料
    const result = await TempUser.create({
      ...req.body,
      company,
      department,
      createdBy: req.user._id // 添加 createdBy 欄位,設置為當前用戶的 ID
    })

    // 更完整的變更記錄
    const changes = {}

    // 必填欄位一定會有值,直接記錄
    changes.name = {
      from: null,
      to: result.name
    }
    changes.status = {
      from: null,
      to: result.status
    }
    changes.effectiveDate = {
      from: null,
      to: result.effectiveDate
    }

    // 其他選填欄位,只在有值時才記錄
    if (result.englishName) {
      changes.englishName = {
        from: null,
        to: result.englishName
      }
    }
    if (result.personalEmail) {
      changes.personalEmail = {
        from: null,
        to: result.personalEmail
      }
    }
    if (result.IDNumber) {
      changes.IDNumber = {
        from: null,
        to: result.IDNumber
      }
    }
    if (result.gender) {
      changes.gender = {
        from: null,
        to: result.gender
      }
    }
    if (result.cellphone) {
      changes.cellphone = {
        from: null,
        to: result.cellphone
      }
    }
    if (result.birthDate) {
      changes.birthDate = {
        from: null,
        to: result.birthDate
      }
    }
    if (result.permanentAddress) {
      changes.permanentAddress = {
        from: null,
        to: result.permanentAddress
      }
    }
    if (result.contactAddress) {
      changes.contactAddress = {
        from: null,
        to: result.contactAddress
      }
    }
    if (result.emergencyName) {
      changes.emergencyName = {
        from: null,
        to: result.emergencyName
      }
    }
    if (result.emergencyCellphone) {
      changes.emergencyCellphone = {
        from: null,
        to: result.emergencyCellphone
      }
    }
    if (result.emergencyRelationship) {
      changes.emergencyRelationship = {
        from: null,
        to: result.emergencyRelationship
      }
    }
    if (companyData?.name) {
      changes.company = {
        from: null,
        to: companyData.name
      }
    }
    if (departmentData?.name) {
      changes.department = {
        from: null,
        to: departmentData.name
      }
    }
    if (result.jobTitle) {
      changes.jobTitle = {
        from: null,
        to: result.jobTitle
      }
    }
    if (result.salary) {
      changes.salary = {
        from: null,
        to: result.salary
      }
    }
    if (result.extNumber) {
      changes.extNumber = {
        from: null,
        to: result.extNumber
      }
    }
    if (result.seatDescription) {
      changes.seatDescription = {
        from: null,
        to: result.seatDescription
      }
    }
    if (result.note) {
      changes.note = {
        from: null,
        to: result.note
      }
    }
    if (result.isTransferred !== undefined) {
      changes.isTransferred = {
        from: null,
        to: result.isTransferred
      }
    }

    // 記錄異動
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
        departmentId: departmentData?.departmentId,
        companyId: companyData?.companyId
      },
      targetModel: 'tempUsers',
      changes
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '招聘資料創建成功',
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
    } else {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: '未知錯誤'
      })
    }
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
    if (req.query.department) {
      query.department = new mongoose.Types.ObjectId(req.query.department)
    }

    // 處理日期搜索
    if (req.query.effectiveStartDate && req.query.effectiveEndDate) {
      const startDate = new Date(req.query.effectiveStartDate)
      const endDate = new Date(req.query.effectiveEndDate)

      // 如果開始日期和結束日期相同，將結束日期設為當天的最後一毫秒
      if (startDate.toDateString() === endDate.toDateString()) {
        endDate.setHours(23, 59, 59, 999)
      }

      query.effectiveDate = {
        $gte: startDate,
        $lte: endDate
      }
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

    const sortField = req.query.sortBy || 'createdAt'
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
      {
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'createdBy'
        }
      },
      { $unwind: { path: '$createdBy', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'users',
          localField: 'lastModifiedBy',
          foreignField: '_id',
          as: 'lastModifiedBy'
        }
      },
      { $unwind: { path: '$lastModifiedBy', preserveNullAndEmptyArrays: true } },
      { $sort: { [sortField]: sortOrder } },
      { $skip: (page - 1) * itemsPerPage },
      { $limit: itemsPerPage }
    ]

    const [result, totalCount] = await Promise.all([
      TempUser.aggregate(pipeline),
      TempUser.countDocuments(query)
    ])

    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: {
        data: result,
        totalItems: totalCount,
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

    // 先獲取原始資料,並展開公司和部門資訊
    const originalTempUser = await TempUser.findById(req.params.id)
      .populate('company', 'name companyId')
      .populate('department', 'name departmentId')

    if (!originalTempUser) {
      throw new Error('NOT FOUND')
    }

    const updateData = { ...req.body }

    // 創建變更記錄物件
    const auditChanges = {}

    // 處理所有欄位的變更
    const updateFields = [
      'name',
      'englishName',
      'personalEmail',
      'IDNumber',
      'gender',
      'cellphone',
      'birthDate',
      'permanentAddress',
      'contactAddress',
      'emergencyName',
      'emergencyCellphone',
      'emergencyRelationship',
      'jobTitle',
      'salary',
      'extNumber',
      'effectiveDate',
      'status',
      'seatDescription',
      'note',
      'isTransferred',
      'associatedUserId'
    ]

    // 比較原始數據和更新數據,記錄變更
    updateFields.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(updateData, field)) {
        const originalValue = originalTempUser[field]
        const updatedValue = updateData[field]

        if (originalValue?.toString() !== updatedValue?.toString()) {
          auditChanges[field] = {
            from: originalValue || null,
            to: updatedValue || null
          }
        }
      }
    })

    // 處理公司和部門的變更
    if (updateData.company && updateData.company !== originalTempUser.company?._id.toString()) {
      const newCompany = await Company.findById(updateData.company)
      auditChanges.company = {
        from: originalTempUser.company?.name || null,
        to: newCompany?.name || null
      }
    }

    if (updateData.department && updateData.department !== originalTempUser.department?._id.toString()) {
      const newDepartment = await Department.findById(updateData.department)
      auditChanges.department = {
        from: originalTempUser.department?.name || null,
        to: newDepartment?.name || null
      }
    }

    // 如果有欄位被更改才更新數據
    if (Object.keys(auditChanges).length > 0) {
      const updatedTempUser = await TempUser.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      )
        .populate('company', 'name companyId')
        .populate('department', 'name departmentId')

      // 記錄變更到 AuditLog
      await AuditLog.create({
        operatorId: req.user._id,
        operatorInfo: {
          name: req.user.name,
          userId: req.user.userId
        },
        action: '修改',
        targetId: updatedTempUser._id,
        targetInfo: {
          name: updatedTempUser.name,
          departmentId: updatedTempUser.department?.departmentId,
          companyId: updatedTempUser.company?.companyId
        },
        targetModel: 'tempUsers',
        changes: auditChanges
      })

      res.status(StatusCodes.OK).json({
        success: true,
        message: '招聘資料更新成功',
        result: updatedTempUser
      })
    } else {
      res.status(StatusCodes.OK).json({
        success: true,
        message: '沒有欄位被修改',
        result: originalTempUser
      })
    }
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
      personalEmail: tempUser.personalEmail,
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
      note: tempUser.note,
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
    const { tempUserId, userId } = req.params

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
