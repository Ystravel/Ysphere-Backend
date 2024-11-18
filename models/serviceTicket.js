import { Schema, model, ObjectId } from 'mongoose'

const serviceTicketSchema = new Schema({
  ticketId: {
    type: String,
    required: true,
    unique: true
  },
  requesterId: {
    type: ObjectId,
    ref: 'users',
    required: [true, '請選擇申請人']
  },
  title: {
    type: String,
    required: [true, '請輸入標題']
  },
  description: {
    type: String,
    required: [true, '請描述問題描述']
  },
  category: {
    type: String,
    enum: ['硬體問題', '軟體問題', '網路問題', '帳號權限', '其他'],
    required: [true, '請選擇問題類別']
  },
  priority: {
    type: String,
    enum: ['低', '中', '高', '緊急'],
    default: '中'
  },
  status: {
    type: String,
    enum: ['待處理', '處理中', '待確認', '已完成', '已取消'],
    default: '待處理'
  },
  assigneeId: {
    type: ObjectId,
    ref: 'users',
    default: null
  },
  location: {
    type: String,
    required: [true, '請輸入故障/問題地點']
  },
  attachments: [{
    url: String,
    publicId: String
  }],
  solution: {
    type: String,
    required: [
      function () { return this.status === '已完成' },
      '已完成的請求必須填寫處理方案'
    ]
  },
  solutionUpdatedAt: {
    type: Date
  }
}, {
  timestamps: true,
  versionKey: false
})

// 狀態更新中間件
serviceTicketSchema.pre('save', function (next) {
  if (this.isModified('solution')) {
    this.solutionUpdatedAt = new Date()
  }

  if (this.isModified('status')) {
    if (this.status === '已完成' && !this.solution) {
      const err = new Error('已完成的請求必須填寫處理方案')
      return next(err)
    }

    if (this.status === '已完成' && this.attachments?.length > 0) {
      this._deleteAttachments = true
    }
  }

  next()
})

export default model('serviceTickets', serviceTicketSchema)
