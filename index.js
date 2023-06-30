const express = require('express');
const multer = require('multer');

const app = express();

app.use(express.static('public'));
const upload = multer({
    dest: 'uploads/'
});
app.post('/upload', upload.single('pptx'), async(req, res) => {
    let path = req.file.path;
    console.log(req.file.originalname);
    if (fs.existsSync(path)) {
        let result;
        try {
            result = await generateWeeklyMarkdown(path);
        } catch (e) {
            result = 'error';
        }
        res.send(result);
		fs.unlinkSync(path);
    } else {
        res.status(400).send('File not exists.');
    }
});

const fs = require('fs');
const PPTX2Json = require('pptx2json');
const pptx2json = new PPTX2Json();

const getType = content => content['p:nvSpPr'][0]['p:nvPr'][0]['p:ph']?.[0]['$']['type'];

const TitleKeys = {
    TO_DO: 'to do',
    HAVE_DONE: 'have done',
    OTHER_THINGS: 'other things'
};

const toMarkdown = (list) => {
    let map = Array.from(new Set(list.filter(e => e.level === 0).map(e => e.text))).reduce((a, k) => (a[k] = [], a), {});
    let currentKey;
    for (let e of list) {
        if (e.level === 0) {
            currentKey = e.text;
        } else {
            map[currentKey].push(e);
        }
    }
    let flatten = [];
    for (let text in map) {
        flatten.push({
            level: 0,
            text
        });
        flatten = [...flatten, ...map[text]];
    }
    return flatten.map(e => '  '.repeat(e.level + 2) + ' - ' + e.text).join('\n');
};

const generateWeeklyMarkdown = async(pptx) => {
    const json = await pptx2json.toJson(pptx);
    const slides = Object.keys(json).filter(k => k.startsWith('ppt/slides') && k.endsWith('.xml')).map(k => json[k]['p:sld']['p:cSld'][0]['p:spTree'][0]['p:sp']);

    const summary = {
        [TitleKeys.TO_DO]: [],
        [TitleKeys.HAVE_DONE]: []
    };
    let lastTitle = TitleKeys.HAVE_DONE;
    let time;
    let mainTitle;
    for (let slide of slides) {
        let isMainSlide = false;
        slide.sort((c1, c2) => {
            let t1 = getType(c1);
            t1 = t1 ? t1.toLowerCase().includes('title') : false;
            let t2 = getType(c2);
            t2 = t2 ? t2.toLowerCase().includes('title') : false;
            return t2 - t1;
        }).map(c => getType(c));

        let slideLevel = 0;
        for (let content of slide) {
            let text = content['p:txBody'][0]['a:p'][0]['a:r']?.[0]['a:t'][0];
            let type = getType(content);

            if (type === 'ctrTitle') {
                isMainSlide = true;
                mainTitle = text;
            }

            const paragraphs = content['p:txBody'][0]['a:p'];
            for (let paragraph of paragraphs) {
                let level = paragraph['a:pPr']?.[0]['$']['lvl'];
                level = level && !isNaN(level) ? parseInt(level) : 0;
                level += slideLevel;
                let text = paragraph['a:r'] ? paragraph['a:r'].map(e => e['a:t']).join('') : '';
                text = text.trim();

                if (isMainSlide) {
                    const rawTime = text.split(/[~-]/gi).map(e => e.trim()).filter(e => e).pop();
                    try {
                        const parsedTime = new Date(rawTime);
                        if (parsedTime instanceof Date && !isNaN(parsedTime)) {
                            time = parsedTime;
                        }
                    } catch (e) {}
                }

                if (type === 'title') {
                    if (!['to do', 'have done', 'other things'].some(e => e === text.toLowerCase())) {
                        summary[lastTitle.toLowerCase()]?.push({
                            level,
                            text
                        });
                        slideLevel++;
                    } else {
                        lastTitle = text;
                    }
                }

                if (!isMainSlide && type === undefined && text) {
                    let key = lastTitle.toLowerCase();
                    if (key !== 'other things') {
                        summary[key]?.push({
                            level,
                            text
                        });
                    }
                }
            }
        }
    }
    let haveDone = '   - Have Done\n' + toMarkdown(summary[TitleKeys.HAVE_DONE]);
    let toDo = '   - To Do\n' + toMarkdown(summary[TitleKeys.TO_DO]);
    return ` - ${mainTitle}\n${haveDone}\n${toDo}`;
}

app.listen(process.env.PORT || 3000, () => {
    console.log(`Server is listening on port ${process.env.PORT || 3000}`);
});