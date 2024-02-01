const express = require('express');
const cheerio = require('cheerio');
const CryptoJS = require('crypto-js');
const axios = require('axios');
const cache = require('memory-cache');

const app = express();

class AsianLoad {
    constructor() {
        this.proxy_url = "https://simple-proxy.xartpvt.workers.dev/?destination=";

        this.keys = {
            key: CryptoJS.enc.Utf8.parse('93422192433952489752342908585752'),
            iv: CryptoJS.enc.Utf8.parse('9262859232435825'),
        };
        this.client = axios;
        this.cacheDuration = 120; // Cache duration in seconds (e.g., 10 minutes)
    }

    async extract(req, res) {
        const url = new URL(req.query.url);
        const cacheKey = url.href;
        const wsres = await this.client.get(this.proxy_url + url);
        const ws$ = cheerio.load(wsres.data);

        const videoUrl = new URL("https:" + ws$('li.kvid').attr('data-video'));

        // Generate cache key based on request URL


        // Check if the response is cached
        const cachedResponse = cache.get(cacheKey);
        console.log(cachedResponse);
        if (cachedResponse) {
            console.log('Cache hit!');
            res.json(cachedResponse);
            return;
        }


        const res1 = await this.client.get(videoUrl.href);

        const $ = cheerio.load(res1.data);

        const encryptedParams = await this.generateEncryptedAjaxParams($, videoUrl.searchParams.get('id') ?? '');
        const encryptedData = await this.client.get(
            `${this.proxy_url}${videoUrl.protocol}//${videoUrl.hostname}/encrypt-ajax.php?${encryptedParams}`,
            {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                },
            }
        );

        const decryptedData = await this.decryptAjaxData(encryptedData.data.data);

        if (!decryptedData.source) throw new Error('No source found. Try a different server.');

        const sources = [];
        decryptedData.source.forEach((source) => {
            sources.push({
                url: source.file,
                isM3U8: source.file.includes('.m3u8'),
            });
        });

        decryptedData.source_bk.forEach((source) => {
            sources.push({
                url: source.file,
                isM3U8: source.file.includes('.m3u8'),
            });
        });

        const subtitles = decryptedData.track?.tracks?.map((track) => ({
            url: track.file,
            lang: track.kind === 'thumbnails' ? 'Default (maybe)' : track.kind,
        }));

        const responseData = {
            sources,
            subtitles,
        };

        // Cache the response with expiration time
        cache.put(cacheKey, responseData, this.cacheDuration * 1000); // Convert seconds to milliseconds for the library

        res.json(responseData);
    }

    async generateEncryptedAjaxParams($, id) {
        const encryptedKey = CryptoJS.AES.encrypt(id, this.keys.key, {
            iv: this.keys.iv,
        }).toString();

        const $script = $("script[data-name='crypto']");

        if (!$script.length) {
            throw new Error("Script element with data-name='crypto' not found.");
        }

        const scriptValue = $script.data().value;
        if (!scriptValue) {
            throw new Error("Value attribute not found in the script element.");
        }

        const decryptedToken = CryptoJS.AES.decrypt(scriptValue, this.keys.key, {
            iv: this.keys.iv,
        }).toString(CryptoJS.enc.Utf8);

        return `id=${encryptedKey}&alias=${decryptedToken}`;
    }

    async decryptAjaxData(encryptedData) {
        const decryptedData = CryptoJS.enc.Utf8.stringify(
            CryptoJS.AES.decrypt(encryptedData, this.keys.key, {
                iv: this.keys.iv,
            })
        );

        return JSON.parse(decryptedData);
    }
}

const asianLoad = new AsianLoad();

app.get('/extract', async (req, res) => {
    try {
        await asianLoad.extract(req, res);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
