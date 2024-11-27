import { StatusCodes } from 'http-status-codes'
import validator from 'validator'
import { v2 as cloudinary } from 'cloudinary'
import Announcement from '../models/announcement.js'
import AuditLog from '../models/auditLog.js'
import mongoose from 'mongoose'

// 創建公告
export const create = async (req, res) => {
  try {
    // 處理上傳的附件
    const attachments = req.files?.map(file => ({
      url: file.path,
      publicId: file.filename,
      filename: file.originalname,
      fileType: file.mimetype.split('/')[0],
      fileFormat: file.mimetype.split('/')[1]
    })) || []

    const announcement = await Announcement.create({
      ...req.body,
      author: req.user._id,
      attachments
    })

    // 记录操作日志
    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: {
        name: req.user.name,
        userId: req.user.userId
      },
      action: '創建',
      targetId: announcement._id,
      targetModel: 'announcements',
      changes: {
        title: {
          from: null,
          to: announcement.title
        },
        type: {
          from: null,
          to: announcement.type
        }
      }
    })

    const populatedAnnouncement = await Announcement.findById(announcement._id)
      .populate('author', 'name userId')
      .populate('department', 'name')

    res.status(StatusCodes.OK).json({
      success: true,
      message: '公告創建成功',
      result: populatedAnnouncement
    })
  } catch (error) {
    // 如果創建失敗，清理已上傳的附件
    if (req.files) {
      for (const file of req.files) {
        await cloudinary.uploader.destroy(file.filename)
      }
    }
    console.error('Create announcement error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '公告創建失敗',
      error: error.message
    })
  }
}

// 獲取公告列表
export const getAll = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      type,
      search,
      department,
      sortBy = '-createdAt'
    } = req.query

    const query = {}

    // 只查詢未刪除的公告
    query.deleteDate = { $gt: new Date() }

    if (type) query.type = type
    if (department) query.department = new mongoose.Types.ObjectId(department)

    // 文字搜尋
    if (search) {
      query.$or = [
        { title: new RegExp(search, 'i') },
        { content: new RegExp(search, 'i') }
      ]
    }

    // 使用 aggregate 處理置頂排序邏輯
    const aggregatePipeline = [
      { $match: query },
      {
        $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'authorInfo'
        }
      },
      { $unwind: '$authorInfo' },
      {
        $lookup: {
          from: 'departments',
          localField: 'department',
          foreignField: '_id',
          as: 'departmentInfo'
        }
      },
      { $unwind: '$departmentInfo' },
      {
        $addFields: {
          sortOrder: {
            $switch: {
              branches: [
                { case: { $eq: ['$type', '置頂'] }, then: 5 },
                { case: { $eq: ['$type', '重要'] }, then: 4 },
                { case: { $eq: ['$type', '系統'] }, then: 3 },
                { case: { $eq: ['$type', '活動'] }, then: 2 },
                { case: { $eq: ['$type', '一般'] }, then: 1 }
              ],
              default: 0
            }
          }
        }
      },
      {
        $sort: {
          sortOrder: -1,
          [sortBy.replace('-', '')]: sortBy.startsWith('-') ? -1 : 1
        }
      },
      {
        $skip: (page - 1) * limit
      },
      {
        $limit: parseInt(limit)
      }
    ]

    const [announcements, total] = await Promise.all([
      Announcement.aggregate(aggregatePipeline),
      Announcement.countDocuments(query)
    ])

    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: {
        data: announcements,
        total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    })
  } catch (error) {
    console.error('Get announcements error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '獲取公告列表失敗'
    })
  }
}

// 獲取單一公告
export const getOne = async (req, res) => {
  try {
    if (!validator.isMongoId(req.params.id)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '公告ID格式錯誤'
      })
    }

    const announcement = await Announcement.findById(req.params.id)
      .populate('author', 'name userId')
      .populate('department', 'name')

    if (!announcement) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到該公告'
      })
    }

    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: announcement
    })
  } catch (error) {
    console.error('Get announcement error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '獲取公告失敗'
    })
  }
}

// 編輯公告
export const update = async (req, res) => {
  try {
    if (!validator.isMongoId(req.params.id)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '公告ID格式錯誤'
      })
    }

    const announcement = await Announcement.findById(req.params.id)
    if (!announcement) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到該公告'
      })
    }

    // 檢查權限：只有作者和管理員可以編輯
    if (announcement.author.toString() !== req.user._id.toString() && req.user.role < 8) {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '您沒有權限編輯此公告'
      })
    }

    // 處理新上傳的附件
    const newAttachments = req.files?.map(file => ({
      url: file.path,
      publicId: file.filename,
      filename: file.originalname,
      fileType: file.mimetype.split('/')[0],
      fileFormat: file.mimetype.split('/')[1]
    })) || []

    const updateData = {
      ...req.body,
      attachments: [...announcement.attachments, ...newAttachments]
    }

    const updatedAnnouncement = await Announcement.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('author', 'name userId')
      .populate('department', 'name')

    // 记录修改日志
    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: {
        name: req.user.name,
        userId: req.user.userId
      },
      action: '修改',
      targetId: announcement._id,
      targetModel: 'announcements',
      changes: {
        title: {
          from: announcement.title,
          to: updateData.title
        },
        type: {
          from: announcement.type,
          to: updateData.type
        }
      }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '公告更新成功',
      result: updatedAnnouncement
    })
  } catch (error) {
    console.error('Update announcement error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '更新公告失敗'
    })
  }
}

// 刪除公告
export const remove = async (req, res) => {
  try {
    if (!validator.isMongoId(req.params.id)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '公告ID格式錯誤'
      })
    }

    const announcement = await Announcement.findById(req.params.id)
    if (!announcement) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到該公告'
      })
    }

    // 檢查權限：只有作者和管理員可以刪除
    if (announcement.author.toString() !== req.user._id.toString() && req.user.role < 8) {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '您沒有權限刪除此公告'
      })
    }

    // 刪除所有附件
    for (const attachment of announcement.attachments) {
      await cloudinary.uploader.destroy(attachment.publicId)
    }

    await announcement.deleteOne()

    // 记录删除日志
    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: {
        name: req.user.name,
        userId: req.user.userId
      },
      action: '刪除',
      targetId: announcement._id,
      targetModel: 'announcements',
      changes: {
        title: {
          from: announcement.title,
          to: null
        },
        type: {
          from: announcement.type,
          to: null
        }
      }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '公告刪除成功'
    })
  } catch (error) {
    console.error('Delete announcement error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '刪除公告失敗'
    })
  }
}

// 獲取首頁公告列表
export const getHomeAnnouncements = async (req, res) => {
  try {
    const query = {
      deleteDate: { $gt: new Date() }
    }

    const announcements = await Announcement.aggregate([
      { $match: query },
      {
        $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'authorInfo'
        }
      },
      { $unwind: '$authorInfo' },
      {
        $lookup: {
          from: 'departments',
          localField: 'department',
          foreignField: '_id',
          as: 'departmentInfo'
        }
      },
      { $unwind: '$departmentInfo' },
      {
        $addFields: {
          sortOrder: {
            $switch: {
              branches: [
                { case: { $eq: ['$type', '置頂'] }, then: 5 },
                { case: { $eq: ['$type', '重要'] }, then: 4 },
                { case: { $eq: ['$type', '系統'] }, then: 3 },
                { case: { $eq: ['$type', '活動'] }, then: 2 },
                { case: { $eq: ['$type', '一般'] }, then: 1 }
              ],
              default: 0
            }
          }
        }
      },
      {
        $sort: {
          sortOrder: -1,
          createdAt: -1
        }
      },
      {
        $limit: 5
      }
    ])

    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: announcements
    })
  } catch (error) {
    console.error('Get home announcements error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '獲取首頁公告失敗'
    })
  }
}

// 刪除單個附件
export const deleteAttachment = async (req, res) => {
  try {
    const { id, attachmentId } = req.params

    const announcement = await Announcement.findById(id)
    if (!announcement) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到該公告'
      })
    }

    const attachment = announcement.attachments.id(attachmentId)
    if (!attachment) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到該附件'
      })
    }

    // 從 Cloudinary 刪除文件
    await cloudinary.uploader.destroy(attachment.publicId)

    // 從公告中移除附件
    announcement.attachments.pull(attachmentId)
    await announcement.save()

    res.status(StatusCodes.OK).json({
      success: true,
      message: '附件刪除成功'
    })
  } catch (error) {
    console.error('Delete attachment error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '刪除附件失敗'
    })
  }
}
