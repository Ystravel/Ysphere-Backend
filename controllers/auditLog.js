import { StatusCodes } from 'http-status-codes'
import AuditLog from '../models/auditLog.js'
import mongoose from 'mongoose'

// 取得所有異動紀錄（包含分頁與排序）
export const getAll = async (req, res) => {
  try {
    const itemsPerPage = req.query.itemsPerPage * 1 || 10
    const page = parseInt(req.query.page) || 1

    const {
      operatorId,
      targetId,
      action,
      targetModel,
      startDate,
      endDate
    } = req.query

    const pipeline = [
      {
        $lookup: {
          from: 'users',
          localField: 'operatorId',
          foreignField: '_id',
          as: 'operator'
        }
      },
      {
        $addFields: {
          operator: { $arrayElemAt: ['$operator', 0] }
        }
      },
      {
        $lookup: {
          from: 'departments',
          localField: 'changes.department.from',
          foreignField: '_id',
          as: 'fromDepartment'
        }
      },
      {
        $lookup: {
          from: 'departments',
          localField: 'changes.department.to',
          foreignField: '_id',
          as: 'toDepartment'
        }
      },
      {
        $addFields: {
          'changes.department.from': {
            $cond: [
              { $or: [{ $eq: [{ $type: '$changes.department.from' }, 'string'] }, { $eq: ['$changes.department.from', null] }] },
              '$changes.department.from',
              { $arrayElemAt: ['$fromDepartment.name', 0] }
            ]
          },
          'changes.department.to': {
            $cond: [
              { $or: [{ $eq: [{ $type: '$changes.department.to' }, 'string'] }, { $eq: ['$changes.department.to', null] }] },
              '$changes.department.to',
              { $arrayElemAt: ['$toDepartment.name', 0] }
            ]
          }
        }
      },
      {
        $unset: ['fromDepartment', 'toDepartment']
      }
    ]

    // 構建匹配條件
    const matchConditions = []

    // 優先使用 ID 查詢操作者
    if (operatorId) {
      if (mongoose.Types.ObjectId.isValid(operatorId)) {
        matchConditions.push({
          operatorId: new mongoose.Types.ObjectId(operatorId)
        })
      } else {
        // 如果不是有效的 ObjectId,則根據 userId 查詢
        matchConditions.push({
          $or: [
            { 'operator.userId': operatorId },
            // 如果關聯查詢為空,才使用 operatorInfo
            {
              $and: [
                { operator: null },
                { 'operatorInfo.userId': operatorId }
              ]
            }
          ]
        })
      }
    }

    // 優先使用 ID 查詢目標對象
    if (targetId) {
      if (mongoose.Types.ObjectId.isValid(targetId)) {
        matchConditions.push({
          targetId: new mongoose.Types.ObjectId(targetId)
        })
      } else {
        const searchConditions = []

        if (!targetModel || targetModel === 'users') {
          searchConditions.push(
            { 'targetData.userId': targetId },
            // 如果關聯查詢為空,才使用 targetInfo
            {
              $and: [
                { targetData: null },
                { 'targetInfo.userId': targetId }
              ]
            }
          )
        }
        if (!targetModel || targetModel === 'departments') {
          searchConditions.push(
            { 'targetData.departmentId': targetId },
            // 如果關聯查詢為空,才使用 targetInfo
            {
              $and: [
                { targetData: null },
                { 'targetInfo.departmentId': targetId }
              ]
            }
          )
        }

        matchConditions.push({ $or: searchConditions })
      }
    }

    if (action) {
      matchConditions.push({ action })
    }

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
        dateCondition.$lte = new Date(endDate)
      }
      matchConditions.push({ createdAt: dateCondition })
    }

    if (matchConditions.length > 0) {
      pipeline.push({
        $match: { $and: matchConditions }
      })
    }

    // 排序處理
    const sortBy = req.query.sortBy || 'createdAt'
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1
    pipeline.push({ $sort: { [sortBy]: sortOrder } })

    // 計算總數
    const countPipeline = [...pipeline]
    const [{ total } = { total: 0 }] = await AuditLog.aggregate([
      ...countPipeline,
      { $count: 'total' }
    ])

    // 分頁處理
    pipeline.push(
      { $skip: (page - 1) * itemsPerPage },
      { $limit: itemsPerPage }
    )

    // 最終投影 - 優先使用關聯數據
    pipeline.push({
      $project: {
        createdAt: 1,
        action: 1,
        targetModel: 1,
        changes: 1,
        operatorInfo: 1,
        targetInfo: 1,
        operator: {
          $cond: {
            if: { $ne: ['$operator', null] },
            then: '$operator',
            else: '$operatorInfo'
          }
        },
        targetData: {
          $cond: {
            if: { $ne: [{ $arrayElemAt: ['$targetData', 0] }, null] },
            then: { $arrayElemAt: ['$targetData', 0] },
            else: '$targetInfo'
          }
        }
      }
    })

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
