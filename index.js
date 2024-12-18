import 'dotenv/config'
import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import { StatusCodes } from 'http-status-codes'
import mongoSanitize from 'express-mongo-sanitize'

// 導入路由
import routeUser from './routes/user.js'
import routeCompany from './routes/company.js'
import routeDepartment from './routes/department.js'
import routeAuditLog from './routes/auditLog.js'
import routeServiceTicket from './routes/serviceTicket.js'
import routeTempUser from './routes/tempUser.js'
import routeExcelImport from './routes/excelImport.js'
import routeAnnouncement from './routes/announcement.js'

// passport
import './passport/passport.js'

const app = express()

app.use(cors({
  origin: true, // 將 origin 設為 true 即可允許所有網域
  credentials: true // 支援 cookie
}))

// app.use(cors({
//   origin (origin, callback) {
//     if (origin === undefined ||
//       origin.includes('github.io') || origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('ys7029.com')
//     ) {
//       callback(null, true)
//     } else {
//       callback(new Error('CORS'), false)
//     }
//   }
// }))

app.use(express.json())
app.use((_, req, res, next) => {
  res.status(StatusCodes.BAD_REQUEST).json({
    success: false,
    message: '資料格式錯誤'
  })
})

app.use(mongoSanitize())

app.use('/uploads', express.static(process.env.UPLOAD_PATH))

app.use('/user', routeUser)
app.use('/company', routeCompany)
app.use('/department', routeDepartment)
app.use('/auditLog', routeAuditLog)
app.use('/serviceTicket', routeServiceTicket)
app.use('/tempUser', routeTempUser)
app.use('/excelImport', routeExcelImport)
app.use('/announcement', routeAnnouncement)

app.all('*', (req, res) => {
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    message: '找不到路由'
  })
})

app.listen(process.env.PORT || 4001, async () => {
  console.log('伺服器啟動')
  await mongoose.connect(process.env.DB_URI)
  mongoose.set('sanitizeFilter', true)
  console.log('資料庫連線成功')
})
