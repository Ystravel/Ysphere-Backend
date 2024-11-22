/* eslint-disable camelcase */
import Department from '../models/department.js'
import Company from '../models/company.js'
import User from '../models/user.js'
import AuditLog from '../models/auditLog.js'
import { StatusCodes } from 'http-status-codes'
import mongoose from 'mongoose'

// 創建部門
export const create = async (req, res) => {
  try {
    const { name, c_id, departmentId } = req.body

    // 驗證公司是否存在
    const company = await Company.findById(c_id)
    if (!company) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '選擇的公司不存在'
      })
    }

    // 檢查部門ID格式
    if (!departmentId.startsWith(company.companyId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '部門代碼格式錯誤，必須包含公司編號'
      })
    }

    // 檢查部門ID是否已存在
    const existingDepartment = await Department.findOne({ departmentId })
    if (existingDepartment) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '該部門代碼已存在'
      })
    }

    // 創建部門
    const department = await Department.create({
      name,
      c_id,
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
    const errorMessage = error.code === 11000 ? '該部門代碼已存在' : '創建部門時發生錯誤'
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
    // 1. 解析請求參數
    const {
      page = 1,
      itemsPerPage = 10,
      sortBy = 'departmentId',
      sortOrder = 'asc',
      companyId,
      search
    } = req.query

    // 2. 驗證並轉換參數
    const pageNum = Math.max(1, parseInt(page))
    const limit = Math.max(1, parseInt(itemsPerPage))
    const skip = (pageNum - 1) * limit

    // 3. 構建查詢條件
    const query = {}

    // 處理公司篩選
    if (companyId) {
      if (!mongoose.Types.ObjectId.isValid(companyId)) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: '無效的公司 ID'
        })
      }
      query.c_id = new mongoose.Types.ObjectId(companyId)
    }

    // 處理搜尋條件
    if (search) {
      query.$or = [
        { name: new RegExp(search.trim(), 'i') },
        { departmentId: new RegExp(search.trim(), 'i') }
      ]
    }

    // 4. 構建排序條件
    const sortOptions = {}
    // 驗證排序欄位是否合法
    const validSortFields = ['departmentId', 'name', 'c_id.name']
    if (validSortFields.includes(sortBy)) {
      sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1
    } else {
      sortOptions.departmentId = 1 // 默認排序
    }

    // 5. 執行查詢
    try {
      // 同時執行查詢和計數
      const [departments, total] = await Promise.all([
        Department.find(query)
          .populate('c_id', 'name companyId')
          .sort(sortOptions)
          .skip(skip)
          .limit(limit)
          .lean(),
        Department.countDocuments(query)
      ])

      // 6. 獲取每個部門的員工統計
      const departmentsWithStats = await Promise.all(
        departments.map(async (dept) => {
          try {
            // 獲取在職員工數
            const [activeCount, totalCount] = await Promise.all([
              User.countDocuments({
                department: dept._id,
                employmentStatus: '在職'
              }),
              User.countDocuments({
                department: dept._id
              })
            ])

            return {
              ...dept,
              employeeCount: activeCount,
              totalEmployeeCount: totalCount
            }
          } catch (error) {
            console.error(`Error getting employee counts for department ${dept._id}:`, error)
            return {
              ...dept,
              employeeCount: 0,
              totalEmployeeCount: 0
            }
          }
        })
      )

      // 7. 計算分頁資訊
      const totalPages = Math.ceil(total / limit)
      const hasNextPage = pageNum < totalPages
      const hasPrevPage = pageNum > 1

      // 8. 返回成功響應
      return res.status(StatusCodes.OK).json({
        success: true,
        message: '取得部門列表成功',
        result: {
          data: departmentsWithStats,
          pagination: {
            totalItems: total,
            totalPages,
            currentPage: pageNum,
            itemsPerPage: limit,
            hasNextPage,
            hasPrevPage
          },
          summary: {
            totalDepartments: total,
            filteredDepartments: departments.length,
            activeFilter: !!companyId || !!search
          }
        }
      })
    } catch (error) {
      console.error('Database query error:', error)
      throw new Error('數據庫查詢錯誤')
    }
  } catch (error) {
    // 9. 錯誤處理
    console.error('Get departments error:', error)
    const errorMessage = error.message || '取得部門列表時發生錯誤'
    const statusCode = error.message === '無效的公司 ID'
      ? StatusCodes.BAD_REQUEST
      : StatusCodes.INTERNAL_SERVER_ERROR

    return res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
    const { name, c_id, departmentId } = req.body
    const department = await Department.findById(req.params.id).populate('c_id', 'name companyId')

    if (!department) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到指定的部門'
      })
    }

    // 如果要更改公司
    if (c_id !== department.c_id._id.toString()) {
      const newCompany = await Company.findById(c_id)
      if (!newCompany) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: '新的公司不存在'
        })
      }

      // 確認新的部門ID是否包含新公司的編號
      if (!departmentId.startsWith(newCompany.companyId)) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: '部門代碼格式錯誤，必須包含正確的公司編號'
        })
      }
    } else {
      // 如果沒有更改公司，確認部門ID是否包含當前公司編號
      if (!departmentId.startsWith(department.c_id.companyId)) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: '部門代碼格式錯誤，必須包含公司編號'
        })
      }
    }

    // 檢查新的部門ID是否與其他部門重複
    if (departmentId !== department.departmentId) {
      const existingDepartment = await Department.findOne({ departmentId })
      if (existingDepartment && existingDepartment._id.toString() !== department._id.toString()) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: '該部門代碼已存在'
        })
      }
    }

    const changes = {}
    if (name !== department.name) changes.name = { from: department.name, to: name }
    if (departmentId !== department.departmentId) changes.departmentId = { from: department.departmentId, to: departmentId }
    if (c_id !== department.c_id._id.toString()) {
      const newCompany = await Company.findById(c_id)
      changes.companyName = { from: department.c_id.name, to: newCompany.name }
    }

    // 更新部門資料
    Object.assign(department, {
      name,
      c_id,
      departmentId
    })
    await department.save()

    // 審計日誌
    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: { name: req.user.name, userId: req.user.userId },
      action: '修改',
      targetId: department._id,
      targetInfo: { name: department.name, departmentId: department.departmentId },
      targetModel: 'departments',
      changes
    })

    const updatedDepartment = await Department.findById(department._id)
      .populate('c_id', 'name companyId')
      .lean()

    res.status(StatusCodes.OK).json({
      success: true,
      message: '部門更新成功',
      result: updatedDepartment
    })
  } catch (error) {
    console.error('更新部門錯誤:', error)
    const errorMessage = error.code === 11000 ? '該部門代碼已存在' : '更新部門時發生錯誤'
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: errorMessage
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
