const express = require('express');
const cors = require('cors');
const { Vika } = require('@vikadata/vika');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// 中间件
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 配置 multer 存储
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/') // 确保这个目录存在
    },
    filename: function (req, file, cb) {
        // 生成唯一文件名
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
    }
});

// 配置 multer 上传
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 增加到 10MB
    },
    fileFilter: function (req, file, cb) {
        // 检查文件类型
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('只允许上传图片文件！'), false);
        }
        cb(null, true);
    }
});

// 初始化维格表 SDK
const vika = new Vika({ 
    token: process.env.VIKA_TOKEN,
    fieldKey: "name",
    baseURL: "https://api.vika.cn/fusion/v1",
    requestConfig: {
        timeout: 60000, // 增加超时时间到60秒
        retries: 5,     // 增加重试次数到5次
        retryDelay: 3000, // 增加重试延迟到3秒
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.VIKA_TOKEN}`
        }
    }
});

// 获取数据表实例
const datasheet = vika.datasheet(process.env.VIKA_DATASHEET_ID);

// 获取所有会议记录
app.get('/api/meetings', async (req, res) => {
    try {
        const response = await datasheet.records.query({
            viewId: process.env.VIKA_VIEW_ID
        });

        if (response.success) {
            res.json({
                code: 200,
                success: true,
                message: "获取会议记录成功",
                data: response.data
            });
        } else {
            res.status(500).json({
                code: 500,
                success: false,
                message: "获取会议记录失败",
                error: response
            });
        }
    } catch (error) {
        res.status(500).json({
            code: 500,
            success: false,
            message: "服务器内部错误",
            error: error.message
        });
    }
});

// 新增会议记录
app.post('/api/meetings', async (req, res) => {
    try {
        console.log('收到添加会议请求:', req.body);
        
        const { conference_date, conference_location, conference_theme, conference_content, conference_picture } = req.body;

        // 验证必填字段
        if (!conference_date || !conference_location || !conference_theme || !conference_content) {
            console.log('缺少必填字段:', { conference_date, conference_location, conference_theme, conference_content });
            return res.status(400).json({
                code: 400,
                success: false,
                message: "缺少必填字段",
                required: ["conference_date", "conference_location", "conference_theme", "conference_content"]
            });
        }

        // 创建新记录
        console.log('准备创建记录:', {
            conference_date: Number(conference_date),
            conference_location,
            conference_theme,
            conference_content,
            conference_picture
        });

        // 构建记录数据
        const recordData = {
            fields: {
                conference_date: Number(conference_date),
                conference_location,
                conference_theme,
                conference_content
            }
        };

        // 如果有图片，添加到记录中
        if (conference_picture && conference_picture.length > 0) {
            recordData.fields.conference_picture = conference_picture;
        }

        console.log('发送到维格表的数据:', JSON.stringify(recordData, null, 2));

        // 添加重试逻辑
        let retries = 3;
        let lastError = null;
        
        while (retries > 0) {
            try {
                console.log(`尝试创建记录 (剩余重试次数: ${retries})`);
                const response = await datasheet.records.create([recordData]);
                console.log('维格表响应:', JSON.stringify(response, null, 2));

                if (response.success) {
                    return res.json({
                        code: 200,
                        success: true,
                        message: "新增会议记录成功",
                        data: response.data
                    });
                } else {
                    lastError = response;
                    console.error('维格表创建记录失败:', JSON.stringify(response, null, 2));
                    retries--;
                    if (retries > 0) {
                        console.log(`等待2秒后重试...`);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
            } catch (error) {
                lastError = error;
                console.error('维格表API调用错误:', error);
                console.error('错误详情:', {
                    message: error.message,
                    stack: error.stack,
                    response: error.response?.data
                });
                retries--;
                if (retries > 0) {
                    console.log(`等待2秒后重试...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }

        // 所有重试都失败后返回错误
        console.error('所有重试都失败，返回错误:', lastError);
        res.status(500).json({
            code: 500,
            success: false,
            message: "新增会议记录失败",
            error: lastError
        });
    } catch (error) {
        console.error('服务器内部错误:', error);
        console.error('错误详情:', {
            message: error.message,
            stack: error.stack,
            response: error.response?.data
        });
        res.status(500).json({
            code: 500,
            success: false,
            message: "服务器内部错误",
            error: error.message,
            stack: error.stack
        });
    }
});

// 修改会议记录
app.put('/api/meetings/:recordId', async (req, res) => {
    try {
        const { recordId } = req.params;
        const { conference_date, conference_location, conference_theme, conference_content, conference_picture } = req.body;

        // 验证必填字段
        if (!conference_date || !conference_location || !conference_theme || !conference_content) {
            return res.status(400).json({
                code: 400,
                success: false,
                message: "缺少必填字段",
                required: ["conference_date", "conference_location", "conference_theme", "conference_content"]
            });
        }

        // 更新记录
        const response = await datasheet.records.update([
            {
                recordId,
                fields: {
                    conference_date: Number(conference_date),
                    conference_location,
                    conference_theme,
                    conference_content,
                    conference_picture: conference_picture || null
                }
            }
        ]);

        if (response.success) {
            res.json({
                code: 200,
                success: true,
                message: "修改会议记录成功",
                data: response.data
            });
        } else {
            res.status(500).json({
                code: 500,
                success: false,
                message: "修改会议记录失败",
                error: response
            });
        }
    } catch (error) {
        res.status(500).json({
            code: 500,
            success: false,
            message: "服务器内部错误",
            error: error.message
        });
    }
});

// 删除会议记录
app.delete('/api/meetings/:recordId', async (req, res) => {
    try {
        const { recordId } = req.params;

        // 删除记录
        const response = await datasheet.records.delete([recordId]);

        if (response.success) {
            res.json({
                code: 200,
                success: true,
                message: "删除会议记录成功",
                data: response.data
            });
        } else {
            res.status(500).json({
                code: 500,
                success: false,
                message: "删除会议记录失败",
                error: response
            });
        }
    } catch (error) {
        res.status(500).json({
            code: 500,
            success: false,
            message: "服务器内部错误",
            error: error.message
        });
    }
});

// 图片上传接口
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: '没有上传文件'
            });
        }

        console.log('收到文件上传请求:', {
            filename: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size
        });

        // 获取图片元数据
        const metadata = await sharp(req.file.path).metadata();
        
        // 调用维格表附件上传API
        try {
            // 创建FormData对象
            const formData = new FormData();
            // 读取文件内容
            const fileContent = fs.readFileSync(req.file.path);
            // 添加文件到FormData
            formData.append('file', fileContent, {
                filename: req.file.originalname,
                contentType: req.file.mimetype
            });
            
            console.log('准备调用维格表附件上传API');
            
            // 调用维格表API上传附件
            const uploadResponse = await axios.post(
                `https://api.vika.cn/fusion/v1/datasheets/${process.env.VIKA_DATASHEET_ID}/attachments`,
                formData,
                {
                    headers: {
                        ...formData.getHeaders(),
                        'Authorization': `Bearer ${process.env.VIKA_TOKEN}`
                    }
                }
            );
            
            console.log('维格表附件上传API响应:', JSON.stringify(uploadResponse.data, null, 2));
            
            if (uploadResponse.data && uploadResponse.data.success) {
                // 返回维格表API的响应结果
                return res.json({
                    success: true,
                    data: uploadResponse.data.data
                });
            } else {
                throw new Error(uploadResponse.data?.message || '维格表附件上传失败');
            }
        } catch (apiError) {
            console.error('维格表API调用错误:', apiError);
            console.error('错误详情:', {
                message: apiError.message,
                response: apiError.response?.data
            });
            
            // 如果维格表API调用失败，回退到本地存储方式
            console.log('维格表API调用失败，回退到本地存储方式');
            
            // 生成唯一ID和token
            const fileId = Date.now().toString();
            const token = Math.random().toString(36).substring(2);
            const fileUrl = `/uploads/${req.file.filename}`;
            
            console.log('使用本地存储方式，文件URL:', fileUrl);
            
            // 返回上传结果
            res.json({
                success: true,
                data: {
                    id: fileId,
                    name: req.file.originalname,
                    size: req.file.size,
                    mimeType: req.file.mimetype,
                    token: token,
                    width: metadata.width,
                    height: metadata.height,
                    url: fileUrl
                }
            });
        }
    } catch (error) {
        console.error('图片上传错误:', error);
        console.error('错误详情:', {
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({
            success: false,
            message: '图片上传失败',
            error: error.message
        });
    }
});

// 图片代理接口
app.get('/api/proxy-image', async (req, res) => {
    try {
        const imageUrl = req.query.url;
        if (!imageUrl) {
            return res.status(400).json({
                success: false,
                message: '缺少图片URL参数'
            });
        }

        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: {
                'Referer': 'https://vika.cn/'
            }
        });

        res.setHeader('Content-Type', response.headers['content-type']);
        res.send(response.data);
    } catch (error) {
        console.error('图片代理错误:', error);
        res.status(500).json({
            success: false,
            message: '图片获取失败',
            error: error.message
        });
    }
});

// 启动服务器
app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
});