import express, { type Application, type Request, type Response } from 'express';
import config from './config/index.js';
import { userRoute } from './modules/users/user.route.js';
import { profileRoute } from './modules/profiles/profile.route.js';
import { authRoute } from './modules/auth/auth.route.js';
import fs from 'fs'
import logger from './middleware/logger.js';

const app: Application = express()

app.use(express.json())
app.use(express.text())
app.use(express.urlencoded({ extended: true }))

// custom
app.use(logger)


app.get('/', (req: Request, res: Response) => {
    res.status(200).json({
        success: true,
        message: "This is root route",
        author: "RS"
    })
})

app.post("/", async (req: Request, res: Response) => {
    try {
        const body = req.body;
        // const {name , age } = req.body;
        res.status(200).json({
            success: true,
            message: "This is a test api ! ",
            data: body
            // data : {name , age }
        })
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error?.message,
            error: error,
        })
    }

})

app.use("/api/v1/users", userRoute);
app.use("/api/v1/profile" , profileRoute);
app.use("/api/v1/auth" , authRoute);

app.listen(config.port, () => {
    console.log(`Example app listening on port ${config.port}`)
})

export default app;