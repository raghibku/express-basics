import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from 'jsonwebtoken'
import config from "../config/index.js";
import { pool } from "../db/index.js";

const auth = async(req : Request ,res : Response , next: NextFunction)=>{
    // 1 => check if the token exist
    // 2 => verify token
    // 3 => check if user exists
    // 4 => check if user is active

    const token = req.headers.authorization ;

    if(!token){
        res.status(401).json({
            success : false ,
            message : "Unauthorized Access!"
        })
    }

    const decode = jwt.verify(token as string, config.jwt_secret_key) as JwtPayload;

    const user = await pool.query(`
        SELECT * FROM users WHERE email=$1
        `,[decode.email]
    )
    if (user.rowCount === 0 ){
        res.status(404).json({
            success : false ,
            message : "User not found!!"
        })
    }
    if (!user.rows[0].is_active ){
        res.status(403).json({
            success : false ,
            message : "Forbidden access!!"
        })
    }
    console.log(user.rows[0])


    req.user = decode
    console.log(req)
    next()
}

export default auth