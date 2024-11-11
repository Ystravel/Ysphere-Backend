import { StatusCodes } from 'http-status-codes'
import AuditLog from '../models/auditLog.js'

// 取得所有異動紀錄（包含分頁與排序）
export const getAll = async (req, res) => {
  try {
    const itemsPerPage = req.query.itemsPerPage * 1 || 10
    const page = parseInt(req.query.page) || 1

    // 獲取所有查詢參數
    const {
      operatorId,
      targetId,
      action,
      targetModel,
      startDate,
      endDate
    } = req.query

    // 構建查詢管道
    const pipeline = [
      // 關聯操作者
      {
        $lookup: {
          from: 'users',
          localField: 'operatorId',
          foreignField: '_id',
          as: 'operator'
        }
      },
      {
        $unwind: {
          path: '$operator',
          preserveNullAndEmptyArrays: true
        }
      },
      // 關聯被操作對象
      {
        $lookup: {
          from: 'users',
          localField: 'targetId',
          foreignField: '_id',
          as: 'target'
        }
      },
      {
        $unwind: {
          path: '$target',
          preserveNullAndEmptyArrays: true
        }
      }
    ]

    // 構建匹配條件
    const matchConditions = []

    // 操作者搜尋
    if (operatorId) {
      matchConditions.push({
        $or: [
          { 'operator.name': new RegExp(operatorId, 'i') },
          { 'operator.userId': new RegExp(operatorId, 'i') }
        ]
      })
    }

    // 被操作對象搜尋
    if (targetId) {
      matchConditions.push({
        $or: [
          { 'target.name': new RegExp(targetId, 'i') },
          { 'target.userId': new RegExp(targetId, 'i') }
        ]
      })
    }

    // 操作類型篩選
    if (action) {
      matchConditions.push({ action })
    }

    // 資料類型篩選
    if (targetModel) {
      matchConditions.push({ targetModel })
    }

    // 日期範圍篩選
    if (startDate || endDate) {
      const dateCondition = {}
      if (startDate) {
        dateCondition.$gte = new Date(startDate)
      }
      if (endDate) {
        dateCondition.$lte = new Date(endDate + 'T23:59:59.999Z')
      }
      matchConditions.push({ createdAt: dateCondition })
    }

    // 加入匹配條件
    if (matchConditions.length > 0) {
      pipeline.push({
        $match: {
          $and: matchConditions
        }
      })
    }

    // 處理排序
    const sortBy = req.query.sortBy || 'createdAt'
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1
    pipeline.push({ $sort: { [sortBy]: sortOrder } })

    // 計算總數
    const countPipeline = [...pipeline]
    const [{ total } = { total: 0 }] = await AuditLog.aggregate([
      ...countPipeline,
      { $count: 'total' }
    ])

    // 添加分頁
    pipeline.push(
      { $skip: (page - 1) * itemsPerPage },
      { $limit: itemsPerPage }
    )

    // 調整最終輸出格式
    pipeline.push({
      $project: {
        createdAt: 1,
        action: 1,
        targetModel: 1,
        changes: 1,
        operator: {
          _id: '$operator._id',
          name: '$operator.name',
          userId: '$operator.userId'
        },
        target: {
          _id: '$target._id',
          name: '$target.name',
          userId: '$target.userId'
        }
      }
    })

    // 執行查詢
    const data = await AuditLog.aggregate(pipeline)

    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: {
        data,
        totalItems: total || 0,
        itemsPerPage,
        currentPage: page
      }
    })
  } catch (error) {
    console.error('Get audit logs error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '獲取異動紀錄時發生錯誤',
      error: error.message
    })
  }
}
