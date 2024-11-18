import { Schema, model, ObjectId } from 'mongoose'

const departmentSchema = new Schema({
  name: {
    type: String,
    required: [true, '請輸入部門名稱']
  },
  departmentId: {
    type: String,
    unique: true
  },
  companyId: { // 參考新的 Company 模型
    type: ObjectId,
    ref: 'companies',
    required: [true, '請選擇所屬公司']
  }
}, {
  timestamps: true,
  versionKey: false
})

departmentSchema.index({ name: 1, companyId: 1 }, { unique: true })

export default model('departments', departmentSchema)
