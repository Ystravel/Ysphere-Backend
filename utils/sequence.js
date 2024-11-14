// utils/sequenceUtils.js
import User from '../models/user.js'
import Department from '../models/department.js'

/**
 * 獲取下一個可用的員工編號
 * @returns {Promise<string>} 格式化的員工編號 (例如: '0014')
 */
export const getNextUserNumber = async () => {
  // 查找所有用戶的 userId，並提取數字部分
  const users = await User.find({}, { userId: 1 })
  const numbers = users
    .map(user => parseInt(user.userId))
    .filter(num => !isNaN(num)) // 過濾掉無效的數字

  // 如果沒有現有用戶，從 1 開始
  if (numbers.length === 0) {
    return '0001'
  }

  // 找到最大的數字
  const maxNumber = Math.max(...numbers)
  // 返回下一個數字
  return String(maxNumber + 1).padStart(4, '0')
}

/**
 * 獲取下一個可用的部門編號
 * @param {number} companyId - 公司ID
 * @returns {Promise<string>} 格式化的部門編號 (例如: '101' 為第一個公司的01號部門)
 */
export const getNextDepartmentNumber = async (companyId) => {
  // 查找特定公司的所有部門編號
  const departments = await Department.find({ companyId }, { departmentId: 1 })

  // 提取部門編號的序號部分（最後兩位數字）
  const numbers = departments
    .map(dept => {
      // 從部門編號中提取最後兩位數字
      const match = dept.departmentId.match(/\d{2}$/)
      return match ? parseInt(match[0]) : 0
    })
    .filter(num => !isNaN(num))

  // 如果該公司沒有部門，從 1 開始
  if (numbers.length === 0) {
    return `${companyId}01`
  }

  // 找到最大的序號
  const maxNumber = Math.max(...numbers)
  // 返回下一個序號，格式為 "公司ID + 兩位數序號"
  return `${companyId}${String(maxNumber + 1).padStart(2, '0')}`
}
