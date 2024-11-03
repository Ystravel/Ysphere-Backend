// models/auditLog.js
import { Schema, model, ObjectId } from 'mongoose'

const auditLogSchema = new Schema({
  operatorId: {
    type: ObjectId,
    ref: 'users',
    default: null
  },
  action: {
    type: String,
    enum: ['創建', '修改', '刪除'],
    required: true
  },
  targetId: {
    type: ObjectId,
    ref: 'users',
    required: true
  },
  targetModel: {
    type: String,
    enum: ['users', 'departments', 'assets'],
    required: true
  },
  changes: {
    type: Object, // 改為 Object 類型而不是 Map
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
})

export default model('AuditLog', auditLogSchema)
