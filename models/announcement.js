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
    ref: 'departments',
    required: [true, '請選擇發布部門']
  },
  author: {
    type: ObjectId,
    ref: 'users',
    required: [true, '請選擇發布者']
  },
  deleteDate: {
    type: Date,
    default: undefined
  },
  attachments: [{
    url: String,
    publicId: String,
    filename: String,
    fileType: String,
    fileFormat: String,
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

export default model('announcements', announcementSchema)
