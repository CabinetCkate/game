import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests',testMatch:['show.live.spec.js','studio.live.spec.js'],fullyParallel:false,workers:1,timeout:180000,use:{baseURL:'http://localhost:8080',browserName:'chromium',channel:process.env.CI?undefined:'msedge',viewport:{width:1440,height:1000},screenshot:'only-on-failure'},reporter:'list'});
