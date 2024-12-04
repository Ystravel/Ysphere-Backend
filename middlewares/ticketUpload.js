// ticketUpload.js
import multer from 'multer'
import path from 'path'
import fs from 'fs'

// 設定存儲位置
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(process.env.UPLOAD_PATH, 'tickets')
    // 確保目錄存在
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true })
    }
    cb(null, uploadPath)
  },
  filename: function (req, file, cb) {
    // 生成檔案名稱: 時間戳_原始檔名
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
})

// 創建 multer 實例
const ticketUpload = multer({
  storage,
  fileFilter (req, file, callback) {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      callback(null, true)
    } else {
      callback(new Error('FORMAT'), false)
    }
  },
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB
  }
}).array('images', 5) // 最多5張圖片

export default (req, res, next) => {
  ticketUpload(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: '圖片不能超過2MB'
        })
      } else if (error.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          success: false,
          message: '最多只能上傳5張圖片'
        })
      }
      return res.status(400).json({
        success: false,
        message: '上傳錯誤'
      })
    } else if (error) {
      if (error.message === 'FORMAT') {
        return res.status(400).json({
          success: false,
          message: '只能上傳 jpg/png 格式的圖片'
        })
      }
      return res.status(500).json({
        success: false,
        message: '未知錯誤'
      })
    }

    // 設定檔案的完整 URL
    if (req.files) {
      req.files.forEach(file => {
        file.path = `${process.env.UPLOAD_URL}/tickets/${file.filename}`
      })
    }

    next()
  })
}
