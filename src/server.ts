import express, { type Application, type Request, type Response } from 'express';
import config from './config/index.js';
import { initDB , pool } from './db/index.js';

const app: Application = express()

app.use(express.json())
app.use(express.text())
app.use(express.urlencoded({ extended: true }))

initDB();

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

app.post("/api/v1/users", async (req: Request, res: Response) => {
    try {
        const { name, email, password, age } = req.body;
        const result = await pool.query(
            `
        INSERT INTO users (name , email , password , age) VALUES ($1,$2,$3,$4) RETURNING *
        `,
            [name, email, password, age]
        )
        res.status(201).json({
            success: true,
            message: "User created",
            data: result.rows[0]
        })
    } catch (error: any) {
        res.status(500).json({
            success: true,
            message: error?.message,
            error: error,
        })
    }

})

app.get("/api/v1/users", async (req: Request, res: Response) => {
    try {
        const result = await pool.query(
            `
        SELECT * FROM users;
        `
        )
        res.status(200).json({
            success: true,
            message: "Got All the USERS",
            data: result.rows
        })
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error?.message,
            error: error,
        })
    }
})

app.get("/api/v1/users/:id", async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        const result = await pool.query(
            `
        SELECT * FROM users WHERE id=$1;
        `, [id]
        )
        if (result.rows.length > 0) {
            res.status(200).json({
                success: true,
                message: "User found",
                data: result.rows[0]
            })
        } else {
            res.status(404).json({
                success: false,
                message: "User Not found",
            })
        }

    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error?.message,
            error: error,
        })
    }
})

app.put("/api/v1/users/:id", async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, password, age, is_Active } = req.body;
        const result = await pool.query(
            `
            UPDATE users
            SET
            name = COALESCE($1 , name),
            password = COALESCE($2 , password),
            age = COALESCE($3 , age),
            is_Active = COALESCE($4 , is_Active),
            updated_at = NOW()
            WHERE id=$5 RETURNING *
            `,
            [name ?? null, password ?? null, age ?? null, is_Active ?? null, id]
        )
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        res.status(200).json({
            success: true,
            message: "User updated successfully!",
            data: result.rows
        })
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error?.message,
            error: error,
        })
    }
})
app.delete("/api/v1/users/:id", async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `
            DELETE FROM users WHERE id=$1
            `,
            [id]
        )
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        res.status(200).json({
            success: true,
            message: "User deleted successfully!"
        })
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error?.message,
            error: error,
        })
    }
})

app.listen(config.port, () => {
    console.log(`Example app listening on port ${config.port}`)
})