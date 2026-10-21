import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests',testIgnore:['**/features.spec.js','**/multiplayer.spec.js','**/navigation-language.spec.js'],fullyParallel:false,workers:1,use:{baseURL:'http://localhost:8080',browserName:'chromium',channel:process.env.CI?undefined:'msedge',screenshot:'only-on-failure'},reporter:'list'});
