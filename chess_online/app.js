const express = require('express')
const path = require('path')
const app = express()
app.use(express.static(path.join(__dirname, '')))
 
app.listen(8890, () => {
  console.log(`App listening at port 8890`)
})