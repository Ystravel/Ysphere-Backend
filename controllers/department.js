import Department from '../models/department.js'
import Company from '../models/company.js'
import User from '../models/user.js'
import AuditLog from '../models/auditLog.js'
import { StatusCodes } from 'http-status-codes'
import { getNextDepartmentNumber } from '../utils/sequence.js'
import mongoose from 'mongoose'

// 創建部門
export const create = async (req, res) => {
  try {
    const { name, c_id } = req.body // 改用 c_id 而不是 companyId

    // 驗證公司是否存在
    const company = await Company.findById(c_id) // 這裡也改用 c_id
    if (!company) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '選擇的公司不存在'
      })
    }

    // 獲取下一個部門編號
    const departmentId = await getNextDepartmentNumber(c_id) // 這裡也改用 c_id

    // 創建部門
    const department = await Department.create({
      name,
      c_id, // 直接使用 c_id
      departmentId
    })

    // 審計日誌
    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: { name: req.user.name, userId: req.user.userId },
      action: '創建',
      targetId: department._id,
      targetInfo: { name: department.name, departmentId: department.departmentId },
      targetModel: 'departments',
      changes: {
        name: { from: null, to: name },
        departmentId: { from: null, to: departmentId },
        c_id: { from: null, to: c_id },
        companyName: { from: null, to: company.name }
      }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '部門創建成功',
      result: department
    })
  } catch (error) {
    console.error('Error creating department:', error)
    const errorMessage = error.code === 11000 ? '該公司已有相同名稱的部門，請更改部門名稱' : '創建部門時發生錯誤'
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: errorMessage,
      error: error.message
    })
  }
}

// 取得所有部門
// 在 department controller 中
export const getAll = async (req, res) => {
  try {
    const { companyId, search } = req.query

    const query = {}
    if (companyId) {
      query.c_id = new mongoose.Types.ObjectId(companyId)
    }

    // 加入搜尋條件
    if (search) {
      // 使用 $text 搜索，需要在 schema 中設定 text index
      query.$or = [
        { name: new RegExp(search, 'i') }, // 使用 RegExp 對象
        { departmentId: new RegExp(search, 'i') }
      ]
    }

    // 查詢部門並關聯公司資料
    const departments = await Department.find(query)
      .populate('c_id', 'name companyId')
      .sort({ departmentId: 1 })
      .lean()

    // 獲取每個部門的在職員工數
    const departmentsWithCounts = await Promise.all(
      departments.map(async (dept) => {
        const employeeCount = await User.countDocuments({
          department: dept._id,
          employmentStatus: '在職'
        })
        return {
          ...dept,
          employeeCount
        }
      })
    )

    res.status(StatusCodes.OK).json({
      success: true,
      message: '取得部門列表成功',
      result: departmentsWithCounts
    })
  } catch (error) {
    console.error('取得部門列表錯誤:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '取得部門列表時發生錯誤',
      error: error.message
    })
  }
}

// 取得部門詳細資料
export const getById = async (req, res) => {
  try {
    const department = await Department.findById(req.params.id).populate('c_id', 'name')
    if (!department) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到指定的部門'
      })
    }

    const memberCount = await User.countDocuments({
      department: department._id,
      employmentStatus: '在職'
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '獲取部門資料成功',
      result: { ...department.toObject(), memberCount }
    })
  } catch (error) {
    console.error('Get department error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '獲取部門資料時發生錯誤',
      error: error.message
    })
  }
}

// 編輯部門
// 修改 department controller 的 edit 方法
export const edit = async (req, res) => {
  try {
    const { name, c_id, departmentId } = req.body // 改用 c_id
    const department = await Department.findById(req.params.id).populate('c_id', 'name')

    if (!department) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到指定的部門'
      })
    }

    if (departmentId) {
      // 檢查部門編號是否已存在
      const existingDepartment = await Department.findOne({ departmentId })
      if (existingDepartment && existingDepartment._id.toString() !== department._id.toString()) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: '部門編號已存在，請使用其他編號'
        })
      }
    }

    // 修改比較邏輯，使用 c_id 而不是 companyId
    if (name === department.name &&
        c_id === department.c_id._id.toString() && // 修改這裡
        departmentId === department.departmentId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '未進行任何修改'
      })
    }

    const changes = {}
    if (name !== department.name) changes.name = { from: department.name, to: name }
    if (departmentId !== department.departmentId) changes.departmentId = { from: department.departmentId, to: departmentId }
    if (c_id !== department.c_id._id.toString()) { // 修改這裡
      const newCompany = await Company.findById(c_id) // 使用 c_id
      if (!newCompany) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: '新的公司不存在'
        })
      }
      changes.c_id = { from: department.c_id._id, to: c_id } // 修改這裡
      changes.companyName = { from: department.c_id.name, to: newCompany.name }
    }

    // 更新部門資料
    Object.assign(department, {
      name,
      c_id, // 使用 c_id
      departmentId
    })
    await department.save()

    // 修正 AuditLog 創建
    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: {
        name: req.user.name,
        userId: req.user.userId
      },
      action: '修改',
      targetId: department._id,
      targetModel: 'departments',
      targetInfo: {
        name: department.name,
        departmentId: department.departmentId
      },
      changes
    })

    const updatedDepartment = await Department.findById(department._id).populate('c_id', 'name')

    res.status(StatusCodes.OK).json({
      success: true,
      message: '部門更新成功',
      result: updatedDepartment
    })
  } catch (error) {
    console.error('更新部門錯誤:', error)
    const errorMessage = error.code === 11000
      ? '該公司已有相同名稱的部門，請更改部門名稱'
      : '更新部門時發生錯誤'
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: errorMessage,
      field: error.code === 11000 ? 'name' : undefined
    })
  }
}

// 刪除部門
export const remove = async (req, res) => {
  try {
    const { id } = req.params
    const department = await Department.findById(id)
    if (!department) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到指定的部門'
      })
    }

    // 檢查部門是否有在職員工
    const userCount = await User.countDocuments({
      department: department._id,
      employmentStatus: '在職'
    })

    if (userCount > 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '該部門下還有在職員工,無法刪除'
      })
    }

    await department.deleteOne()

    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: { name: req.user.name, userId: req.user.userId },
      action: '刪除',
      targetId: department._id,
      targetInfo: { name: department.name, departmentId: department.departmentId },
      targetModel: 'departments',
      changes: {
        name: { from: department.name, to: null },
        departmentId: { from: department.departmentId, to: null },
        companyId: { from: department.companyId, to: null }
      }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '部門刪除成功'
    })
  } catch (error) {
    console.error('刪除部門錯誤:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '刪除部門時發生錯誤',
      error: error.message
    })
  }
}
