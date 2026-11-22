import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from 'jsonwebtoken'
import config from "../config/index.js";
import { pool } from "../db/index.js";
import type { Role } from "../types/index.js";

//converted to higher order function
// user , agent , admin
const auth = (...roles: Role[]) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        // 1 => check if the token exist
        // 2 => verify token
        // 3 => check if user exists
        // 4 => check if user is active
        try {


            const token = req.headers.authorization;

            if (!token) {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized Access!"
                })
            }

            const decode = jwt.verify(token as string, config.jwt_secret_key) as JwtPayload;

            const user = await pool.query(`
        SELECT * FROM users WHERE email=$1
        `, [decode.email]
            )
            if (user.rowCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: "User not found!!"
                })
            }
            if (!user.rows[0].is_active) {
                return res.status(403).json({
                    success: false,
                    message: "Forbidden access!!"
                })
            }

            if (roles.length && !roles.includes(user.rows[0].role)) {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized Access!"
                })
            }

            console.log(user.rows[0])
            req.user = decode
            console.log(req)
            next()
        } catch (error) {
            next(error)
        }
    }
}

export default auth