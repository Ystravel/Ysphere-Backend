import { v2 as cloudinary } from 'cloudinary'
import { StatusCodes } from 'http-status-codes'
import ServiceTicket from '../models/serviceTicket.js'
import validator from 'validator'
import { getNextTicketNumber } from '../utils/sequence.js'
import UserRole from '../enums/UserRole.js'
import User from '../models/user.js'

// 創建服務請求
export const create = async (req, res) => {
  try {
    // 生成服務請求編號
    const ticketId = await getNextTicketNumber()

    // 處理上傳的圖片
    const attachments = req.files?.map(file => ({
      url: file.path,
      publicId: file.filename
    })) || []

    const ticket = await ServiceTicket.create({
      ...req.body,
      ticketId,
      requesterId: req.user._id,
      attachments // 添加圖片資訊
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '服務請求創建成功',
      result: ticket
    })
  } catch (error) {
    // 如果創建失敗，需要刪除已上傳的圖片
    if (req.files) {
      for (const file of req.files) {
        await cloudinary.uploader.destroy(file.filename)
      }
    }
    console.error('創建服務請求失敗:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '創建服務請求失敗'
    })
  }
}

// 獲取所有服務請求
export const getAll = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sort = '-createdAt',
      status,
      category,
      priority,
      requesterId,
      search
    } = req.query

    const query = {}

    // 處理搜尋條件
    if (status) query.status = status
    if (category) query.category = category
    if (priority) query.priority = priority
    if (requesterId) query.requesterId = requesterId

    // 如果不是 IT/ADMIN/SUPER_ADMIN，只能看到自己的請求
    if (![UserRole.IT, UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(req.user.role)) {
      query.requesterId = req.user._id
    }

    // 文字搜尋條件
    if (search) {
      // 使用聚合查詢來處理關聯資料的搜尋
      const pipeline = [
        {
          $lookup: {
            from: 'users',
            localField: 'requesterId',
            foreignField: '_id',
            as: 'requester'
          }
        },
        {
          $unwind: '$requester'
        },
        {
          $match: {
            $or: [
              { ticketId: new RegExp(search, 'i') },
              { title: new RegExp(search, 'i') },
              { location: new RegExp(search, 'i') },
              { description: new RegExp(search, 'i') },
              { 'requester.extNumber': new RegExp(search, 'i') }
            ]
          }
        }
      ]

      if (status) pipeline.push({ $match: { status } })
      if (category) pipeline.push({ $match: { category } })
      if (priority) pipeline.push({ $match: { priority } })
      if (requesterId) pipeline.push({ $match: { requesterId } })

      // 如果不是 IT/ADMIN/SUPER_ADMIN，只能看到自己的請求
      if (![UserRole.IT, UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(req.user.role)) {
        pipeline.push({ $match: { requesterId: req.user._id } })
      }

      // 計算總數
      const countPipeline = [...pipeline, { $count: 'total' }]
      const totalResult = await ServiceTicket.aggregate(countPipeline)
      const total = totalResult[0]?.total || 0

      // 加入分頁和排序
      pipeline.push(
        { $sort: { [sort.replace('-', '')]: sort.startsWith('-') ? -1 : 1 } },
        { $skip: (page - 1) * limit },
        { $limit: parseInt(limit) }
      )

      const tickets = await ServiceTicket.aggregate(pipeline)

      // 重新 populate assigneeId
      const populatedTickets = await ServiceTicket.populate(tickets, [
        { path: 'requesterId', select: 'name userId extNumber' },
        { path: 'assigneeId', select: 'name userId' }
      ])

      res.status(StatusCodes.OK).json({
        success: true,
        message: '',
        result: {
          data: populatedTickets,
          total,
          page: parseInt(page),
          limit: parseInt(limit)
        }
      })
    } else {
      // 如果沒有搜尋文字，使用原本的查詢方式
      const total = await ServiceTicket.countDocuments(query)
      const tickets = await ServiceTicket.find(query)
        .populate('requesterId', 'name userId extNumber')
        .populate('assigneeId', 'name userId')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)

      res.status(StatusCodes.OK).json({
        success: true,
        message: '',
        result: {
          data: tickets,
          total,
          page: parseInt(page),
          limit: parseInt(limit)
        }
      })
    }
  } catch (error) {
    console.error('獲取服務請求列表失敗:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '獲取服務請求列表失敗',
      error: error.message // 加入詳細錯誤訊息
    })
  }
}

// 獲取單一服務請求
export const getOne = async (req, res) => {
  try {
    if (!validator.isMongoId(req.params.id)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '請求ID格式錯誤'
      })
    }

    const ticket = await ServiceTicket.findById(req.params.id)
      .populate('requesterId', 'name userId')
      .populate('assigneeId', 'name userId')

    if (!ticket) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到該服務請求'
      })
    }

    // 檢查權限：如果不是 IT/ADMIN/SUPER_ADMIN，只能看自己的請求
    if (
      ![UserRole.IT, UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(req.user.role) &&
      ticket.requesterId._id.toString() !== req.user._id.toString()
    ) {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '您沒有權限查看此服務請求'
      })
    }

    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: ticket
    })
  } catch (error) {
    console.error('獲取服務請求失敗:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '獲取服務請求失敗'
    })
  }
}

// 更新服務請求
export const update = async (req, res) => {
  try {
    const ticket = await ServiceTicket.findById(req.params.id)
    if (!ticket) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到該服務請求'
      })
    }

    // 只有 IT/ADMIN/SUPER_ADMIN 可以更新服務請求
    if (![UserRole.IT, UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(req.user.role)) {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '您沒有權限更新此服務請求'
      })
    }

    const oldStatus = ticket.status

    // 如果要更新狀態為已完成，檢查是否有處理方案
    if (req.body.status === '已完成' && !ticket.solution && !req.body.solution) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '請先填寫處理方案再將狀態更改為已完成'
      })
    }

    Object.assign(ticket, req.body)

    // 如果狀態改為已完成，且有附件需要刪除
    if (ticket.status === '已完成' && oldStatus !== '已完成' && ticket.attachments.length > 0) {
      for (const attachment of ticket.attachments) {
        await cloudinary.uploader.destroy(attachment.publicId)
      }
      ticket.attachments = []
    }

    await ticket.save()

    res.status(StatusCodes.OK).json({
      success: true,
      message: '服務請求更新成功',
      result: ticket
    })
  } catch (error) {
    console.error('更新服務請求失敗:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '更新服務請求失敗'
    })
  }
}

// 上傳圖片
export const uploadImages = async (req, res) => {
  console.log('收到的服務請求 ID:', req.params.id) // 確認 ID 是否正確
  if (!validator.isMongoId(req.params.id)) {
    return res.status(400).json({ success: false, message: '請求 ID 格式錯誤' })
  }

  const ticket = await ServiceTicket.findById(req.params.id)
  if (!ticket) {
    return res.status(404).json({ success: false, message: '找不到該服務請求' })
  }

  const attachments = req.files.map(file => ({
    url: file.path,
    publicId: file.filename
  }))

  ticket.attachments.push(...attachments)
  await ticket.save()

  res.status(200).json({ success: true, message: '圖片上傳成功', result: ticket })
}

// 刪除單張圖片
export const deleteImage = async (req, res) => {
  const { ticketId, publicId } = req.params

  try {
    console.log('收到的 Ticket ID:', ticketId)
    console.log('收到的圖片 Public ID:', publicId)

    const ticket = await ServiceTicket.findById(ticketId)
    if (!ticket) {
      return res.status(404).json({ success: false, message: '找不到該服務請求' })
    }

    const fullPublicId = `tickets/${publicId}`

    // 使用 MongoDB 的 $pull 操作符直接更新文檔
    await ServiceTicket.findByIdAndUpdate(
      ticketId,
      {
        $pull: {
          attachments: { publicId: fullPublicId }
        }
      }
    )

    // 從 Cloudinary 刪除圖片
    await cloudinary.uploader.destroy(fullPublicId)

    res.status(200).json({ success: true, message: '圖片刪除成功' })
  } catch (error) {
    console.error('刪除圖片失敗:', error)
    res.status(500).json({ success: false, message: '刪除圖片失敗' })
  }
}

export const deleteTicket = async (req, res) => {
  const { id } = req.params
  try {
    const ticket = await ServiceTicket.findById(id)
    if (!ticket) return res.status(404).json({ success: false, message: '找不到該服務請求' })

    // 確認是否為請求者本人
    if (ticket.requesterId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: '您無權刪除此服務請求' })
    }

    // 刪除附件
    for (const attachment of ticket.attachments) {
      await cloudinary.uploader.destroy(attachment.publicId)
    }

    await ServiceTicket.findByIdAndDelete(id)
    res.status(200).json({ success: true, message: '服務請求刪除成功' })
  } catch (error) {
    console.error('刪除服務請求失敗:', error)
    res.status(500).json({ success: false, message: '刪除失敗' })
  }
}

// 獲取服務請求統計
export const getStats = async (req, res) => {
  try {
    if (![UserRole.IT, UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(req.user.role)) {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '您沒有權限查看統計資料'
      })
    }

    const stats = await ServiceTicket.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ])

    const categoryStats = await ServiceTicket.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      }
    ])

    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: {
        statusStats: stats,
        categoryStats
      }
    })
  } catch (error) {
    console.error('獲取統計資料失敗:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '獲取統計資料失敗'
    })
  }
}

export const getMyTickets = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sort = '-createdAt',
      search
    } = req.query

    const query = {
      requesterId: req.user._id
    }

    if (search) {
      query.$or = [
        { ticketId: new RegExp(search, 'i') },
        { title: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
        { location: new RegExp(search, 'i') }
      ]
    }

    const total = await ServiceTicket.countDocuments(query)
    const tickets = await ServiceTicket.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)

    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: {
        data: tickets,
        total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    })
  } catch (error) {
    console.error('獲取服務請求失敗:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '獲取服務請求失敗'
    })
  }
}

// 使用者更新自己的請求
export const userUpdate = async (req, res) => {
  try {
    const allowedUpdates = ['title', 'category', 'priority', 'location', 'description']
    const updates = Object.keys(req.body)
      .filter(key => allowedUpdates.includes(key))
      .reduce((obj, key) => {
        obj[key] = req.body[key]
        return obj
      }, {})

    const ticket = await ServiceTicket.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    )

    res.status(StatusCodes.OK).json({
      success: true,
      message: '服務請求更新成功',
      result: ticket
    })
  } catch (error) {
    console.error('更新服務請求失敗:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '更新服務請求失敗'
    })
  }
}

export const updateStatus = async (req, res) => {
  try {
    const ticket = await ServiceTicket.findById(req.params.id)

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: '找不到該服務請求'
      })
    }

    // 更新狀態
    if (req.body.status) {
      ticket.status = req.body.status
    }

    // 更新處理者
    if (req.body.assigneeId) {
      ticket.assigneeId = req.body.assigneeId
    } else if (req.body.status && req.body.status !== ticket.status) {
      // 如果更改狀態但沒有指定處理者，則設為當前用戶
      ticket.assigneeId = req.user._id
    }

    // 處理附件
    if (req.body.status === '已完成' && ticket.attachments.length > 0) {
      for (const attachment of ticket.attachments) {
        await cloudinary.uploader.destroy(attachment.publicId)
      }
      ticket.attachments = []
    }

    await ticket.save()

    // 重新獲取並填充用戶資訊
    const updatedTicket = await ServiceTicket.findById(ticket._id)
      .populate('requesterId', 'name userId extNumber')
      .populate('assigneeId', 'name userId')

    res.status(200).json({
      success: true,
      message: '服務請求更新成功',
      result: updatedTicket
    })
  } catch (error) {
    console.error('更新服務請求失敗:', error)
    res.status(500).json({
      success: false,
      message: '更新服務請求失敗'
    })
  }
}

export const getAvailableAssignees = async (req, res) => {
  try {
    const assignees = await User.find({
      role: [UserRole.IT, UserRole.ADMIN, UserRole.SUPER_ADMIN],
      employmentStatus: '在職'
    }).select('name userId')

    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: assignees
    })
  } catch (error) {
    console.error('獲取可用處理者清單失敗:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '獲取可用處理者清單失敗'
    })
  }
}
