import multer from 'multer'
import path from 'path'
import fs from 'fs'

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(process.env.UPLOAD_PATH, 'avatars')
    console.log('Upload directory:', uploadDir)

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
      console.log('Created directory:', uploadDir)
    }
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    const filename = uniqueSuffix + path.extname(file.originalname).toLowerCase()
    console.log('Generated filename:', filename)
    cb(null, filename)
  }
})

const upload = multer({
  storage,
  fileFilter (req, file, callback) {
    console.log('Received file:', file)
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      callback(null, true)
    } else {
      callback(new Error('FORMAT'), false)
    }
  },
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB
  }
}).single('image')

export default (req, res, next) => {
  upload(req, res, (error) => {
    if (req.file) {
      // 確保使用正斜線
      req.file.path = req.file.path.replace(/\\/g, '/')
      console.log('File path:', req.file.path)
    }

    if (error instanceof multer.MulterError) {
      console.error('Multer error:', error)
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: '檔案太大'
        })
      }
      return res.status(400).json({
        success: false,
        message: '上傳錯誤'
      })
    } else if (error) {
      console.error('Upload error:', error)
      if (error.message === 'FORMAT') {
        return res.status(400).json({
          success: false,
          message: '檔案格式錯誤'
        })
      }
      return res.status(500).json({
        success: false,
        message: '未知錯誤'
      })
    }
    next()
  })
}
