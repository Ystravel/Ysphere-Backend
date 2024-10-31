import Company from '../models/company.js'
import Department from '../models/department.js'
import AuditLog from '../models/auditLog.js' // 假設這是異動紀錄模型的路徑
import { StatusCodes } from 'http-status-codes'

export const create = async (req, res) => {
  try {
    const { name, departments } = req.body

    const company = await Company.create({ name, departments })

    await AuditLog.create({
      operatorId: req.user._id, // 使用 operatorId
      action: '創建',
      targetId: company._id,
      targetModel: 'companies',
      changes: { name, departments }
    })

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: '公司創建成功',
      result: company
    })
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '創建公司時發生錯誤',
      error: error.message
    })
  }
}

export const edit = async (req, res) => {
  try {
    const { name, departments } = req.body
    const companyId = req.params.id

    const company = await Company.findByIdAndUpdate(
      companyId,
      { name, departments },
      { new: true }
    )

    if (!company) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到指定的公司'
      })
    }

    await AuditLog.create({
      operatorId: req.user._id,
      action: '修改',
      targetId: company._id,
      targetModel: 'companies',
      changes: { name, departments }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '公司更新成功',
      result: company
    })
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '更新公司時發生錯誤',
      error: error.message
    })
  }
}

export const getAll = async (req, res) => {
  try {
    // 查詢所有公司，並包含部門資訊
    const companies = await Company.find().populate('departments', 'name')

    res.status(StatusCodes.OK).json({
      success: true,
      message: '獲取公司列表成功',
      result: companies
    })
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '獲取公司列表時發生錯誤',
      error: error.message
    })
  }
}

export const remove = async (req, res) => {
  try {
    const companyId = req.params.id
    const company = await Company.findByIdAndDelete(companyId)

    if (!company) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到指定的公司'
      })
    }

    await Department.updateMany({ companyId }, { companyId: null })

    await AuditLog.create({
      operatorId: req.user._id,
      action: '刪除',
      targetId: companyId,
      targetModel: 'companies',
      changes: { name: company.name, departments: company.departments }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '公司刪除成功，所有相關部門的公司已設為空'
    })
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '刪除公司時發生錯誤',
      error: error.message
    })
  }
}
