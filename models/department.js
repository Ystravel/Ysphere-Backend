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
  c_id: {
    type: ObjectId,
    ref: 'companies',
    required: [true, '請選擇所屬公司']
  }
}, {
  timestamps: true,
  versionKey: false
})

departmentSchema.index({ name: 1, c_id: 1 }, { unique: true })

export default model('departments', departmentSchema)
