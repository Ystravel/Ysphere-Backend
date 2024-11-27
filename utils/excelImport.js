/* eslint-disable camelcase */
import xlsx from 'xlsx' // 用於讀取 Excel 檔案
import User from '../models/user.js' // 使用者資料模型
import Company from '../models/company.js' // 公司資料模型
import Department from '../models/department.js' // 部門資料模型
import crypto from 'crypto' // 用於生成隨機密碼

// 主要的 Excel 匯入函數
export const importUsersFromExcel = async (filePath) => {
  try {
    // 第一步：讀取 Excel 檔案
    const workbook = xlsx.readFile(filePath) // 讀取上傳的 Excel 檔案
    const worksheet = workbook.Sheets[workbook.SheetNames[0]] // 取得第一個工作表
    const data = xlsx.utils.sheet_to_json(worksheet) // 將工作表轉換成 JSON 格式

    // 準備要回傳的結果
    const results = {
      success: [], // 成功匯入的資料
      errors: [] // 匯入失敗的資料
    }

    // 第二步：先載入所有公司和部門資料，避免重複查詢資料庫
    const companies = await Company.find()
    const departments = await Department.find()

    // 第三步：逐筆處理 Excel 的每一行資料
    for (const row of data) {
      try {
        // 將 Excel 的欄位對應到資料庫欄位
        const userData = {
          // 基本資料
          name: row['姓名'], // Excel 欄位為「姓名」
          englishName: row['英文名'], // Excel 欄位為「英文名」
          IDNumber: row['身分證號碼'], // Excel 欄位為「身分證號碼」
          birthDate: excelDateToJSDate(row['生日']), // 將 Excel 的日期格式轉換
          gender: row['性別'], // Excel 欄位為「性別」
          personalEmail: row['個人Email'],
          permanentAddress: row['戶籍地址'],
          contactAddress: row['聯絡地址'],
          email: row['公司Email'],

          // 聯絡資訊
          phoneNumber: row['室內電話'],
          cellphone: row['手機號碼'],
          extNumber: row['分機號碼'],
          printNumber: row['列印編號'],

          // 緊急聯絡人
          emergencyName: row['緊急聯絡人姓名'],
          emergencyPhoneNumber: row['緊急聯絡人室內電話'],
          emergencyCellphone: row['緊急聯絡人手機'],
          emergencyRelationship: row['緊急聯絡人關係'],

          // 工作相關
          jobTitle: row['職稱'],
          salary: row['基本薪資'],
          employmentStatus: row['任職狀態'] || '在職', // 如果沒填，預設「在職」
          hireDate: excelDateToJSDate(row['入職日期']),
          resignationDate: row['離職日期'] ? excelDateToJSDate(row['離職日期']) : null,
          note: row['備註'],

          // 保險相關資料
          healthInsuranceStartDate: row['健保加保日期'] ? excelDateToJSDate(row['健保加保日期']) : null,
          healthInsuranceEndDate: row['健保退保日期'] ? excelDateToJSDate(row['健保退保日期']) : null,
          laborInsuranceStartDate: row['勞保加保日期'] ? excelDateToJSDate(row['勞保加保日期']) : null,
          laborInsuranceEndDate: row['勞保退保日期'] ? excelDateToJSDate(row['勞保退保日期']) : null,

          // 薪轉帳戶資訊
          salaryBank: row['薪轉銀行'],
          salaryBankBranch: row['薪轉分行'],
          salaryAccountNumber: row['薪轉帳戶號碼'],

          // 系統帳號資訊
          guideLicense: parseGuideLicense(row['導遊證']), // 解析導遊證資料
          tourManager: row['旅遊經理人'] === '是', // 轉換為 boolean
          YSRCAccount: row['YSRC帳號'],
          YSRCPassword: row['YSRC密碼'],
          YS168Account: row['YS168帳號'],
          YS168Password: row['YS168密碼'],

          // 其他資訊
          disabilityStatus: row['身心障礙身份'] || '否',
          indigenousStatus: row['原住民身份'] === '是', // 轉換為 boolean
          voluntaryPensionRate: row['勞退自提比率'] ? Number(row['勞退自提比率']) : null,
          formStatus: '已完成' // 設定表單狀態為已完成
        }

        // 第四步：查找並設定公司資料
        const company = companies.find(c =>
          c.name === row['所屬公司'] || // 用公司名稱比對
          c.companyId === row['公司代碼'] // 或用公司代碼比對
        )
        if (!company) throw new Error(`找不到公司: ${row['所屬公司']}`)
        userData.company = company._id

        // 第五步：查找並設定部門資料
        const department = departments.find(d =>
          d.name === row['部門'] || // 用部門名稱比對
          d.departmentId === row['部門代碼'] // 或用部門代碼比對
        )
        if (!department) throw new Error(`找不到部門: ${row['部門']}`)
        userData.department = department._id

        // 第六步：生成隨機密碼
        const randomPassword = crypto.randomBytes(8).toString('hex')
        userData.password = randomPassword // 設定密碼
        userData.isFirstLogin = true // 設定為首次登入

        // 第七步：建立新用戶
        const user = await User.create(userData)

        // 第八步：記錄成功資料
        results.success.push({
          name: user.name,
          email: user.email,
          initialPassword: randomPassword // 記錄初始密碼
        })
      } catch (error) {
        // 如果處理過程出錯，記錄錯誤資訊
        results.errors.push({
          row: row['姓名'], // 記錄是哪一筆資料出錯
          error: error.message // 記錄錯誤訊息
        })
      }
    }

    return results // 回傳處理結果
  } catch (error) {
    throw new Error(`Excel 匯入失敗: ${error.message}`)
  }
}

// 輔助函數：將 Excel 的日期格式轉換成 JavaScript 日期物件
function excelDateToJSDate (excelDate) {
  if (!excelDate) return null // 如果沒有日期就回傳 null

  // 如果是字串格式的日期（例如：2024-01-01），直接轉換
  if (typeof excelDate === 'string') {
    const date = new Date(excelDate)
    return isNaN(date.getTime()) ? null : date
  }

  // 如果是 Excel 的數字格式日期，進行轉換
  // Excel 的日期是從 1900-01-01 開始算的天數
  const utc_days = Math.floor(excelDate - 25569)
  const utc_value = utc_days * 86400
  const date_info = new Date(utc_value * 1000)
  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate())
}

// 輔助函數：處理導遊證資料
function parseGuideLicense (licenseStr) {
  if (!licenseStr) return [0] // 如果沒有導遊證資料，回傳 [0]

  // 導遊證類型對照表
  const licenseMap = {
    華語導遊: 1,
    外語導遊: 2,
    華語領隊: 3,
    外語領隊: 4
  }

  // 將字串分割成陣列，並轉換成對應的數字
  const licenses = licenseStr.split(',').map(l => l.trim())
  const result = licenses.map(license => licenseMap[license] || 0)
  return result.length ? result : [0]
}
