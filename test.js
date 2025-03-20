const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
    res.json({ message: '服务器运行正常' });
});

app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
}); 