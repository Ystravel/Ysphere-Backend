import { StatusCodes } from 'http-status-codes'
import AuditLog from '../models/auditLog.js'
import mongoose from 'mongoose'

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
      // 根據 targetModel 做不同的關聯查詢
      {
        $facet: {
          userTarget: [
            {
              $match: {
                targetModel: 'users'
              }
            },
            {
              $lookup: {
                from: 'users',
                localField: 'targetId',
                foreignField: '_id',
                as: 'target'
              }
            }
          ],
          departmentTarget: [
            {
              $match: {
                targetModel: 'departments'
              }
            },
            {
              $lookup: {
                from: 'departments',
                localField: 'targetId',
                foreignField: '_id',
                as: 'target'
              }
            }
          ],
          assetTarget: [
            {
              $match: {
                targetModel: 'assets'
              }
            },
            {
              $lookup: {
                from: 'assets',
                localField: 'targetId',
                foreignField: '_id',
                as: 'target'
              }
            }
          ]
        }
      },
      {
        $project: {
          allTargets: {
            $concatArrays: [
              '$userTarget',
              '$departmentTarget',
              '$assetTarget'
            ]
          }
        }
      },
      {
        $unwind: '$allTargets'
      },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              '$allTargets',
              {
                target: {
                  $arrayElemAt: ['$allTargets.target', 0]
                }
              }
            ]
          }
        }
      }
    ]

    // 構建匹配條件
    const matchConditions = []

    // 修改操作者搜尋邏輯
    if (operatorId) {
      if (mongoose.Types.ObjectId.isValid(operatorId)) {
        matchConditions.push({
          operatorId: new mongoose.Types.ObjectId(operatorId)
        })
      } else {
        matchConditions.push({
          $or: [
            { 'operator.name': new RegExp(operatorId, 'i') },
            { 'operator.userId': new RegExp(operatorId, 'i') }
          ]
        })
      }
    }

    // 修改被操作對象搜尋邏輯
    if (targetId) {
      if (mongoose.Types.ObjectId.isValid(targetId)) {
        matchConditions.push({
          targetId: new mongoose.Types.ObjectId(targetId)
        })
      } else {
        const searchConditions = []

        // 根據不同的目標模型添加搜尋條件
        if (!targetModel || targetModel === 'users') {
          searchConditions.push(
            { 'target.name': new RegExp(targetId, 'i') },
            { 'target.userId': new RegExp(targetId, 'i') }
          )
        }
        if (!targetModel || targetModel === 'departments') {
          searchConditions.push(
            { 'target.name': new RegExp(targetId, 'i') },
            { 'target.departmentId': new RegExp(targetId, 'i') }
          )
        }
        if (!targetModel || targetModel === 'assets') {
          searchConditions.push(
            { 'target.name': new RegExp(targetId, 'i') },
            { 'target.assetId': new RegExp(targetId, 'i') }
          )
        }

        matchConditions.push({ $or: searchConditions })
      }
    }

    // 其他篩選條件
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
        // 將開始日期設為台灣時間當天的 00:00:00
        const startDateTime = new Date(startDate)
        startDateTime.setHours(0, 0, 0, 0)
        dateCondition.$gte = startDateTime
      }
      if (endDate) {
        // 將結束日期設為台灣時間當天的 23:59:59.999
        const endDateTime = new Date(endDate)
        endDateTime.setHours(23, 59, 59, 999)
        dateCondition.$lte = endDateTime
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
        operator: 1,
        target: {
          _id: '$target._id',
          name: '$target.name',
          userId: '$target.userId',
          departmentId: '$target.departmentId',
          assetId: '$target.assetId',
          companyId: '$target.companyId'
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
