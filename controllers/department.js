import Department from '../models/department.js'
import User from '../models/user.js'
import AuditLog from '../models/auditLog.js'
import { StatusCodes } from 'http-status-codes'
import { companyNames } from '../enums/Company.js'
import { getNextDepartmentNumber } from '../utils/sequence.js'
// 創建部門
export const create = async (req, res) => {
  try {
    const { name, companyId } = req.body

    // 使用新的方法獲取部門編號
    const departmentId = await getNextDepartmentNumber(companyId)

    // 創建部門
    const department = await Department.create({
      name,
      companyId,
      departmentId
    })

    // 記錄審計日誌（這部分不變）
    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: {
        name: req.user.name,
        userId: req.user.userId
      },
      action: '創建',
      targetId: department._id,
      targetInfo: {
        name: department.name,
        departmentId: department.departmentId,
        companyId: department.companyId
      },
      targetModel: 'departments',
      changes: {
        name: {
          from: null,
          to: name
        },
        departmentId: {
          from: null,
          to: departmentId
        },
        companyId: {
          from: null,
          to: companyId
        },
        company: {
          from: null,
          to: companyNames[companyId]
        }
      }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '部門創建成功',
      result: department
    })
  } catch (error) {
    console.error('Error creating department:', error)
    let errorMessage = '創建部門時發生錯誤'
    if (error.code === 11000) {
      errorMessage = '該公司已有相同名稱的部門，請更改部門名稱'
    }
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: errorMessage,
      error: error.message
    })
  }
}

// 取得所有部門
export const getAll = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const itemsPerPage = parseInt(req.query.itemsPerPage) || 10
    const sortBy = req.query.sortBy || 'companyId'
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1
    const search = req.query.search || ''
    const companyId = req.query.companyId
    const searchFields = req.query.searchFields || ['name'] // 添加搜尋欄位參數

    // 構建查詢條件
    const query = {}

    // 搜尋條件
    if (search) {
      if (Array.isArray(searchFields)) {
        // 如果有指定多個搜尋欄位，建立 $or 查詢
        query.$or = searchFields.map(field => ({
          [field]: new RegExp(search, 'i')
        }))
      } else {
        // 預設搜尋名稱
        query.name = new RegExp(search, 'i')
      }
    }

    // 公司篩選
    if (companyId) {
      query.companyId = parseInt(companyId)
    }

    // 計算總數
    const total = await Department.countDocuments(query)

    // 取得部門列表
    const departments = await Department.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip((page - 1) * itemsPerPage)
      .limit(itemsPerPage)

    // 取得每個部門的人數
    const departmentsWithCounts = await Promise.all(
      departments.map(async (dept) => {
        const memberCount = await User.countDocuments({
          department: dept._id,
          employmentStatus: '在職'
        })
        return {
          ...dept.toObject(),
          companyName: companyNames[dept.companyId],
          memberCount
        }
      })
    )

    // 完整的回應格式
    res.status(StatusCodes.OK).json({
      success: true,
      message: '取得部門列表成功',
      result: {
        data: departmentsWithCounts,
        totalItems: total,
        currentPage: page,
        itemsPerPage
      }
    })
  } catch (error) {
    console.error('取得部門列表錯誤:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '取得部門列表時發生錯誤',
      error: error.message || '未知錯誤'
    })
  }
}

// 在 department.js controller 中添加新的控制器函數
export const getById = async (req, res) => {
  try {
    const department = await Department.findById(req.params.id)

    if (!department) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到指定的部門'
      })
    }

    // 獲取部門當前在職人數
    const memberCount = await User.countDocuments({
      department: department._id,
      employmentStatus: '在職'
    })

    // 返回部門信息，包括公司名稱和在職人數
    res.status(StatusCodes.OK).json({
      success: true,
      message: '獲取部門資料成功',
      result: {
        ...department.toObject(),
        companyName: companyNames[department.companyId],
        memberCount
      }
    })
  } catch (error) {
    console.error('Get department error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '獲取部門資料時發生錯誤',
      error: error.message || '未知錯誤'
    })
  }
}

// 總公司人數
export const getCompanyTotalCount = async (req, res) => {
  try {
    const totalCompanyCount = await User.aggregate([
      { $group: { _id: '$companyId', total: { $sum: 1 } } }
    ])
    res.status(StatusCodes.OK).json({ totalCompanyCount })
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '計算公司總人數時發生錯誤',
      error: error.message
    })
  }
}

export const getDepartmentCounts = async (req, res) => {
  try {
    const departmentCounts = await User.aggregate([
      { $group: { _id: { companyId: '$companyId', department: '$department' }, total: { $sum: 1 } } }
    ])
    res.status(StatusCodes.OK).json({ departmentCounts })
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '計算各部門人數時發生錯誤',
      error: error.message
    })
  }
}

// 編輯部門
export const edit = async (req, res) => {
  try {
    const { name, companyId, departmentId } = req.body

    // 先獲取原始部門數據
    const originalDepartment = await Department.findById(req.params.id)

    if (!originalDepartment) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到指定的部門'
      })
    }

    // 檢查 departmentId 是否重複
    if (departmentId !== originalDepartment.departmentId) {
      const existingDepartment = await Department.findOne({ departmentId })
      if (existingDepartment) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: '部門編號已存在'
        })
      }
    }

    // 檢查該公司是否有重複的部門名稱
    if (name !== originalDepartment.name || companyId !== originalDepartment.companyId) {
      const existingDepartment = await Department.findOne({ name, companyId })
      if (existingDepartment) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: '該公司已有相同名稱的部門'
        })
      }
    }

    // 更新部門數據
    const updatedDepartment = await Department.findByIdAndUpdate(
      req.params.id,
      { name, companyId, departmentId },
      { new: true }
    )

    // 記錄變更
    const changes = {
      name: {
        from: originalDepartment.name,
        to: name
      },
      departmentId: {
        from: originalDepartment.departmentId,
        to: departmentId
      },
      companyId: {
        from: originalDepartment.companyId,
        to: companyId
      },
      company: {
        from: companyNames[originalDepartment.companyId],
        to: companyNames[companyId]
      }
    }
    // 取得部門人數
    const memberCount = await User.countDocuments({
      department: updatedDepartment._id,
      employmentStatus: '在職'
    })

    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: {
        name: req.user.name,
        userId: req.user.userId
      },
      action: '修改',
      targetId: updatedDepartment._id,
      targetInfo: {
        name: updatedDepartment.name,
        departmentId: updatedDepartment.departmentId,
        companyId: updatedDepartment.companyId
      },
      targetModel: 'departments',
      changes
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '部門更新成功',
      result: {
        ...updatedDepartment.toObject(),
        companyName: companyNames[updatedDepartment.companyId],
        memberCount
      }
    })
  } catch (error) {
    console.error('更新部門錯誤:', error)

    if (error.code === 11000) {
      // 重複的 departmentId
      if (error.keyPattern && error.keyPattern.departmentId) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: '部門編號已存在'
        })
      }
      // 重複的部門名稱和公司組合
      if (error.keyPattern && error.keyPattern.name && error.keyPattern.companyId) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: '該公司已有相同名稱的部門'
        })
      }
    }

    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '更新部門時發生錯誤',
      error: error.message
    })
  }
}

// 刪除部門
export const remove = async (req, res) => {
  try {
    const department = await Department.findById(req.params.id)

    if (!department) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到指定的部門'
      })
    }

    // 檢查部門是否還有在職員工
    const memberCount = await User.countDocuments({
      department: department._id,
      employmentStatus: '在職'
    })

    if (memberCount > 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '此部門還有在職員工，無法刪除'
      })
    }

    await department.deleteOne()
    await User.updateMany({ department: req.params.id }, { department: null })

    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: {
        name: req.user.name,
        userId: req.user.userId
      },
      action: '刪除',
      targetId: department._id,
      targetInfo: {
        name: department.name,
        departmentId: department.departmentId,
        companyId: department.companyId
      },
      targetModel: 'departments',
      changes: {
        name: {
          from: department.name,
          to: null
        },
        departmentId: {
          from: department.departmentId,
          to: null
        },
        companyId: {
          from: department.companyId,
          to: null
        },
        company: {
          from: companyNames[department.companyId],
          to: null
        }
      }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '部門刪除成功'
    })
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '刪除部門時發生錯誤',
      error: error.message
    })
  }
}
