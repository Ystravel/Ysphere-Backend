import { Schema, model, ObjectId } from 'mongoose'

const auditLogSchema = new Schema({
  userId: {
    type: ObjectId,
    ref: 'users',
    required: false
  },
  action: { //做什麼類型的操作
    type: String,
    enum: ['創建', '修改', '刪除'],
    required: true
  },
  targetId: {
    type: ObjectId,
    required: true,
    refPath: 'targetModel'
  },
  targetModel: { //針對什麼要做操作
    type: String,
    enum: ['users', 'departments', 'companies', 'assets'],
    required: true
  },
  changes: { //具體變更什麼
    type: Map, 
    of: String, 
    default: null // 用於儲存被修改的欄位和新值
  },
  createdAt: { //什麼時候做這操作
    type: Date,
    default: Date.now
  }
})

export default model('auditLogs', auditLogSchema)