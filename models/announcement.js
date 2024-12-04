import { Schema, model, ObjectId } from 'mongoose'

const announcementSchema = new Schema({
  title: {
    type: String,
    required: [true, '請輸入公告標題']
  },
  content: {
    type: String,
    required: [true, '請輸入公告內容']
  },
  type: {
    type: String,
    enum: ['置頂', '重要', '活動', '系統', '一般'],
    default: '一般',
    required: [true, '請選擇公告類型']
  },
  department: {
    type: ObjectId,
    ref: 'departments'
  },
  author: {
    type: ObjectId,
    ref: 'users',
    required: true
  },
  expiryDate: {
    type: Date,
    default: null
  },
  deleteDate: {
    type: Date,
    default: null
  },
  attachments: [{
    path: String, // 文件在服務器上的路徑
    filename: String, // 原始文件名
    fileType: String, // 文件類型 (例如: 'image', 'document')
    mimeType: String, // MIME 類型
    size: Number, // 文件大小（bytes）
    uploadDate: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true,
  versionKey: false
})

// 基本索引設置
announcementSchema.index({ title: 'text', content: 'text' })
announcementSchema.index({ type: 1, createdAt: -1 })
announcementSchema.index({ deleteDate: 1 })
announcementSchema.index({ expiryDate: 1 })

export default model('announcements', announcementSchema)
