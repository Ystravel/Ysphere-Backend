import Department from '../models/department.js'
import Company from '../models/company.js'
import User from '../models/user.js'
import AuditLog from '../models/auditLog.js'
import { StatusCodes } from 'http-status-codes'
import { getNextDepartmentNumber } from '../utils/sequence.js'

// 創建部門
export const create = async (req, res) => {
  try {
    const { name, companyId } = req.body

    // 驗證公司是否存在
    const company = await Company.findById(companyId)
    if (!company) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '選擇的公司不存在'
      })
    }

    // 獲取下一個部門編號
    const departmentId = await getNextDepartmentNumber(companyId)

    // 創建部門
    const department = await Department.create({ name, companyId, departmentId })

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
        companyId: { from: null, to: companyId },
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
export const getAll = async (req, res) => {
  try {
    const { page = 1, itemsPerPage = 10, sortBy = 'companyId', sortOrder = 'asc', search, companyId } = req.query

    // 查詢條件
    const query = {}
    if (search) query.name = new RegExp(search, 'i')
    if (companyId) query.companyId = companyId

    // 部門查詢
    const total = await Department.countDocuments(query)
    const departments = await Department.find(query)
      .populate('companyId', 'name')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip((page - 1) * itemsPerPage)
      .limit(Number(itemsPerPage))

    res.status(StatusCodes.OK).json({
      success: true,
      message: '取得部門列表成功',
      result: {
        data: departments,
        totalItems: total,
        currentPage: Number(page),
        itemsPerPage: Number(itemsPerPage)
      }
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
    const department = await Department.findById(req.params.id).populate('companyId', 'name')
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
export const edit = async (req, res) => {
  try {
    const { name, companyId, departmentId } = req.body
    const department = await Department.findById(req.params.id).populate('companyId', 'name')

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

    if (name === department.name &&
        companyId === department.companyId.toString() &&
        departmentId === department.departmentId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '未進行任何修改'
      })
    }

    const changes = {}
    if (name !== department.name) changes.name = { from: department.name, to: name }
    if (departmentId !== department.departmentId) changes.departmentId = { from: department.departmentId, to: departmentId }
    if (companyId !== department.companyId.toString()) {
      const newCompany = await Company.findById(companyId)
      if (!newCompany) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: '新的公司不存在'
        })
      }
      changes.companyId = { from: department.companyId._id, to: companyId }
      changes.companyName = { from: department.companyId.name, to: newCompany.name }
    }

    // 更新部門資料
    Object.assign(department, { name, companyId, departmentId })
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

    res.status(StatusCodes.OK).json({
      success: true,
      message: '部門更新成功',
      result: department
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
        message: '此部門還有在職員工，無法刪除'
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
