import Company from '../models/company.js'
import AuditLog from '../models/auditLog.js'
import { StatusCodes } from 'http-status-codes'
import { getNextCompanyNumber } from '../utils/sequence.js' // 新增

// 創建公司
export const create = async (req, res) => {
  try {
    const { name } = req.body

    // 使用 sequence 工具生成下一個公司編號
    const companyId = await getNextCompanyNumber()

    const company = await Company.create({ name, companyId })

    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: {
        name: req.user.name,
        userId: req.user.userId
      },
      action: '創建',
      targetId: company._id,
      targetInfo: {
        name: company.name,
        companyId: company.companyId
      },
      targetModel: 'companies',
      changes: {
        name: { from: null, to: name },
        companyId: { from: null, to: companyId }
      }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '公司創建成功',
      result: company
    })
  } catch (error) {
    console.error('Error creating company:', error)
    const errorMessage =
      error.code === 11000 ? '公司名稱或編號已存在' : '創建公司時發生錯誤'
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: errorMessage,
      error: error.message
    })
  }
}

// 獲取所有公司
export const getAll = async (req, res) => {
  try {
    const companies = await Company.find()
    res.status(StatusCodes.OK).json({
      success: true,
      message: '獲取公司列表成功',
      result: companies
    })
  } catch (error) {
    console.error('Error fetching companies:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '獲取公司列表失敗',
      error: error.message
    })
  }
}

// 編輯公司
export const edit = async (req, res) => {
  try {
    const { name } = req.body

    const originalCompany = await Company.findById(req.params.id)
    if (!originalCompany) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到指定的公司'
      })
    }

    const updatedCompany = await Company.findByIdAndUpdate(
      req.params.id,
      { name },
      { new: true, runValidators: true }
    )

    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: {
        name: req.user.name,
        userId: req.user.userId
      },
      action: '修改',
      targetId: updatedCompany._id,
      targetInfo: {
        name: updatedCompany.name,
        companyId: updatedCompany.companyId
      },
      targetModel: 'companies',
      changes: {
        name: { from: originalCompany.name, to: updatedCompany.name }
      }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '公司資料更新成功',
      result: updatedCompany
    })
  } catch (error) {
    console.error('Error editing company:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '更新公司時發生錯誤',
      error: error.message
    })
  }
}

// 刪除公司
export const remove = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id)
    if (!company) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到指定的公司'
      })
    }

    await company.deleteOne()

    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: {
        name: req.user.name,
        userId: req.user.userId
      },
      action: '刪除',
      targetId: company._id,
      targetInfo: {
        name: company.name,
        companyId: company.companyId
      },
      targetModel: 'companies',
      changes: {
        name: { from: company.name, to: null },
        companyId: { from: company.companyId, to: null }
      }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '公司刪除成功'
    })
  } catch (error) {
    console.error('Error deleting company:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '刪除公司時發生錯誤',
      error: error.message
    })
  }
}
