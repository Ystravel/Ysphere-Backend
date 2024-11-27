import { importUsersFromExcel } from '../utils/excelImport.js'
import { StatusCodes } from 'http-status-codes'
import fs from 'fs'

export const importExcel = async (req, res) => {
  try {
    // 檢查是否有上傳檔案
    if (!req.file) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '請選擇檔案'
      })
    }

    // 檢查檔案類型
    if (!req.file.originalname.match(/\.(xlsx|xls)$/)) {
      // 刪除不符合格式的檔案
      fs.unlinkSync(req.file.path)
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '請上傳 Excel 檔案 (.xlsx 或 .xls)'
      })
    }

    // 進行檔案匯入
    const results = await importUsersFromExcel(req.file.path)

    // 匯入完成後刪除暫存檔案
    fs.unlinkSync(req.file.path)

    res.status(StatusCodes.OK).json({
      success: true,
      message: '匯入完成',
      result: {
        successCount: results.success.length,
        errorCount: results.errors.length,
        successData: results.success, // 加入成功匯入的資料
        errors: results.errors
      }
    })
  } catch (error) {
    // 確保發生錯誤時也清理檔案
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path)
    }

    console.error('Excel import error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message
    })
  }
}
