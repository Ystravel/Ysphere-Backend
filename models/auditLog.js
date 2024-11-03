import { Schema, model, ObjectId } from 'mongoose'

const auditLogSchema = new Schema({
  operatorId: { // 操作人員的 ID
    type: ObjectId,
    ref: 'users',
    default: null // 預設允許為 null
  },
  action: { // 執行的操作類型
    type: String,
    enum: ['創建', '修改', '刪除'],
    required: true
  },
  targetId: { // 操作目標的 ID
    type: ObjectId,
    ref: 'users',
    required: true
  },
  targetModel: { // 操作目標的模型類型
    type: String,
    enum: ['users', 'departments', 'assets'],
    required: true
  },
  changes: { // 具體修改內容
    type: Map,
    of: String,
    default: null
  },
  createdAt: { // 操作時間
    type: Date,
    default: Date.now
  }
})

export default model('AuditLog', auditLogSchema)
