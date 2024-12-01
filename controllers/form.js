import Form from '../models/form.js'
import { StatusCodes } from 'http-status-codes'
import { v2 as cloudinary } from 'cloudinary'
import AuditLog from '../models/auditLog.js'
import FormTemplate from '../models/formTemplate.js'
import mongoose from 'mongoose'

// 取得下一個表單編號
export const getNextNumber = async (req, res) => {
  try {
    const today = new Date()
    const currentDate = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
    const currentMonth = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`

    // 查找當月最大的流水號
    const latestForm = await Form.findOne({
      formNumber: new RegExp(`^${currentMonth}`)
    }).sort({ formNumber: -1 })

    let nextNumber
    if (latestForm) {
      // 如果當月有資料，取最後4位數字(流水號)加1
      const currentSeq = parseInt(latestForm.formNumber.slice(-4))
      nextNumber = `${currentDate}${String(currentSeq + 1).padStart(4, '0')}`
    } else {
      // 如果當月沒有資料，從0001開始
      nextNumber = `${currentDate}0001`
    }

    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: nextNumber
    })
  } catch (error) {
    console.error('取得表單編號失敗:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '取得表單編號失敗'
    })
  }
}

// 創建表單
export const create = async (req, res) => {
  try {
    console.log('收到創建請求')
    console.log('請求資料:', req.body)

    const result = await Form.create({
      formNumber: req.body.formNumber,
      formTemplate: req.body.formTemplate,
      creator: req.user._id,
      pdfUrl: req.body.pdfUrl,
      cloudinaryPublicId: req.body.cloudinaryPublicId
    })
    console.log('創建成功:', result)

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
        name: result.formNumber
      },
      targetModel: 'forms',
      changes: {
        表單編號: {
          from: null,
          to: result.formNumber
        },
        PDF檔案: {
          from: null,
          to: result.pdfUrl
        }
      }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '表單建立成功',
      result
    })
  } catch (error) {
    console.error('創建失敗:', error)
    if (error.name === 'ValidationError') {
      const key = Object.keys(error.errors)[0]
      const message = error.errors[key].message
      res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message,
        validationError: error.errors
      })
    } else if (error.code === 11000) {
      res.status(StatusCodes.CONFLICT).json({
        success: false,
        message: '表單編號已存在'
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

// 搜尋表單
export const search = async (req, res) => {
  try {
    console.log('收到搜尋請求')
    console.log('查詢參數:', req.query)

    const itemsPerPage = parseInt(req.query.itemsPerPage) || 10
    const page = parseInt(req.query.page) || 1
    const query = {}

    // 處理日期範圍查詢 (先處理日期)
    if (req.query.date) {
      const dates = Array.isArray(req.query.date) ? req.query.date : [req.query.date]

      if (dates.length === 1) {
        const startDate = new Date(dates[0])
        startDate.setHours(0, 0, 0, 0)
        const endDate = new Date(dates[0])
        endDate.setHours(23, 59, 59, 999)
        query.createdAt = { $gte: startDate, $lte: endDate }
      } else if (dates.length === 2) {
        const startDate = new Date(dates[0])
        startDate.setHours(0, 0, 0, 0)
        const endDate = new Date(dates[1])
        endDate.setHours(23, 59, 59, 999)
        query.createdAt = { $gte: startDate, $lte: endDate }
      }
    }

    // 處理具體模板搜尋 (如果有指定具體模板，優先使用)
    if (req.query.formTemplate) {
      query.formTemplate = new mongoose.Types.ObjectId(req.query.formTemplate)
    } else {
      // 如果沒有指定具體模板，才處理公司和類型搜尋
      const templateQuery = {}
      if (req.query.company) {
        templateQuery.company = new mongoose.Types.ObjectId(req.query.company)
      }
      if (req.query.type) {
        templateQuery.type = req.query.type
      }

      // 如果有公司或類型條件，查詢符合條件的模板
      if (Object.keys(templateQuery).length > 0) {
        const templates = await FormTemplate.find(templateQuery).select('_id')
        const templateIds = templates.map(t => t._id)
        query.formTemplate = { $in: templateIds }
      }
    }

    console.log('最終查詢條件:', query)

    // 使用 aggregate 來處理複雜查詢，加入分頁
    const [result] = await Form.aggregate([
      { $match: query },
      {
        $lookup: {
          from: 'formtemplates',
          localField: 'formTemplate',
          foreignField: '_id',
          as: 'formTemplate'
        }
      },
      { $unwind: '$formTemplate' },
      {
        $lookup: {
          from: 'companies',
          localField: 'formTemplate.company',
          foreignField: '_id',
          as: 'formTemplate.company'
        }
      },
      { $unwind: '$formTemplate.company' },
      {
        $lookup: {
          from: 'users',
          localField: 'creator',
          foreignField: '_id',
          as: 'creator'
        }
      },
      { $unwind: '$creator' },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [
            { $skip: (page - 1) * itemsPerPage },
            { $limit: itemsPerPage }
          ]
        }
      }
    ])

    const totalItems = result.metadata[0]?.total || 0

    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: {
        data: result.data,
        totalItems,
        itemsPerPage,
        currentPage: page
      }
    })
  } catch (error) {
    console.error('搜尋失敗，錯誤:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '搜尋失敗',
      error: error.message
    })
  }
}

// 刪除表單
export const remove = async (req, res) => {
  try {
    const result = await Form.findById(req.params.id)
    if (!result) throw new Error('NOT_FOUND')

    // 從 PDF URL 中提取 public_id
    const publicId = result.pdfUrl.split('/').slice(-2).join('/')

    // 刪除 Cloudinary 上的 PDF 檔案
    await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' })
    await result.deleteOne()

    // 記錄審計日誌
    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: {
        name: req.user.name,
        userId: req.user.userId
      },
      action: '刪除',
      targetId: result._id,
      targetInfo: {
        formNumber: result.formNumber
      },
      targetModel: 'forms',
      changes: {
        表單編號: {
          from: result.formNumber,
          to: null
        },
        PDF檔案: {
          from: result.pdfUrl,
          to: null
        }
      }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '表單刪除成功'
    })
  } catch (error) {
    console.error('刪除表單失敗:', error)
    if (error.message === 'NOT_FOUND') {
      res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到表單'
      })
    } else {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: '刪除失敗',
        error: error.message
      })
    }
  }
}

// 上傳 PDF
export const uploadPDF = async (req, res) => {
  try {
    console.log('收到上傳請求')
    console.log('檔案資訊:', req.file)
    if (!req.file) {
      console.log('沒有收到檔案')
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '請上傳 PDF 檔案'
      })
    }

    console.log('上傳成功，傳資訊:', {
      url: req.file.path,
      filename: req.file.filename
    })
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'PDF 上傳成功',
      result: {
        url: req.file.path,
        filename: req.file.filename
      }
    })
  } catch (error) {
    console.error('上傳失敗:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '上傳失敗'
    })
  }
}
