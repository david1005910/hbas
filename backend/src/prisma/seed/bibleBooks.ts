import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const OT_BOOKS = [
  { nameKo: "창세기",   nameHe: "בְּרֵאשִׁית", nameEn: "Genesis",       orderNo: 1,  totalChapters: 50 },
  { nameKo: "출애굽기", nameHe: "שְׁמוֹת",     nameEn: "Exodus",        orderNo: 2,  totalChapters: 40 },
  { nameKo: "레위기",   nameHe: "וַיִּקְרָא",  nameEn: "Leviticus",     orderNo: 3,  totalChapters: 27 },
  { nameKo: "민수기",   nameHe: "בְּמִדְבַּר", nameEn: "Numbers",       orderNo: 4,  totalChapters: 36 },
  { nameKo: "신명기",   nameHe: "דְּבָרִים",   nameEn: "Deuteronomy",   orderNo: 5,  totalChapters: 34 },
  { nameKo: "여호수아", nameHe: "יְהוֹשֻׁעַ",  nameEn: "Joshua",        orderNo: 6,  totalChapters: 24 },
  { nameKo: "사사기",   nameHe: "שׁוֹפְטִים",  nameEn: "Judges",        orderNo: 7,  totalChapters: 21 },
  { nameKo: "룻기",     nameHe: "רוּת",        nameEn: "Ruth",          orderNo: 8,  totalChapters: 4  },
  { nameKo: "사무엘상", nameHe: "שְׁמוּאֵל א", nameEn: "1 Samuel",      orderNo: 9,  totalChapters: 31 },
  { nameKo: "사무엘하", nameHe: "שְׁמוּאֵל ב", nameEn: "2 Samuel",      orderNo: 10, totalChapters: 24 },
  { nameKo: "열왕기상", nameHe: "מְלָכִים א",  nameEn: "1 Kings",       orderNo: 11, totalChapters: 22 },
  { nameKo: "열왕기하", nameHe: "מְלָכִים ב",  nameEn: "2 Kings",       orderNo: 12, totalChapters: 25 },
  { nameKo: "역대상",   nameHe: "דִּבְרֵי הַיָּמִים א", nameEn: "1 Chronicles", orderNo: 13, totalChapters: 29 },
  { nameKo: "역대하",   nameHe: "דִּבְרֵי הַיָּמִים ב", nameEn: "2 Chronicles", orderNo: 14, totalChapters: 36 },
  { nameKo: "에스라",   nameHe: "עֶזְרָא",     nameEn: "Ezra",          orderNo: 15, totalChapters: 10 },
  { nameKo: "느헤미야", nameHe: "נְחֶמְיָה",   nameEn: "Nehemiah",      orderNo: 16, totalChapters: 13 },
  { nameKo: "에스더",   nameHe: "אֶסְתֵּר",    nameEn: "Esther",        orderNo: 17, totalChapters: 10 },
  { nameKo: "욥기",     nameHe: "אִיּוֹב",     nameEn: "Job",           orderNo: 18, totalChapters: 42 },
  { nameKo: "시편",     nameHe: "תְּהִלִּים",  nameEn: "Psalms",        orderNo: 19, totalChapters: 150 },
  { nameKo: "잠언",     nameHe: "מִשְׁלֵי",    nameEn: "Proverbs",      orderNo: 20, totalChapters: 31 },
  { nameKo: "전도서",   nameHe: "קֹהֶלֶת",    nameEn: "Ecclesiastes",  orderNo: 21, totalChapters: 12 },
  { nameKo: "아가",     nameHe: "שִׁיר הַשִּׁירִים", nameEn: "Song of Solomon", orderNo: 22, totalChapters: 8 },
  { nameKo: "이사야",   nameHe: "יְשַׁעְיָהוּ", nameEn: "Isaiah",       orderNo: 23, totalChapters: 66 },
  { nameKo: "예레미야", nameHe: "יִרְמְיָהוּ", nameEn: "Jeremiah",      orderNo: 24, totalChapters: 52 },
  { nameKo: "예레미야애가", nameHe: "אֵיכָה",  nameEn: "Lamentations",  orderNo: 25, totalChapters: 5  },
  { nameKo: "에스겔",   nameHe: "יְחֶזְקֵאל", nameEn: "Ezekiel",       orderNo: 26, totalChapters: 48 },
  { nameKo: "다니엘",   nameHe: "דָּנִיֵּאל",  nameEn: "Daniel",        orderNo: 27, totalChapters: 12 },
  { nameKo: "호세아",   nameHe: "הוֹשֵׁעַ",   nameEn: "Hosea",         orderNo: 28, totalChapters: 14 },
  { nameKo: "요엘",     nameHe: "יוֹאֵל",     nameEn: "Joel",          orderNo: 29, totalChapters: 3  },
  { nameKo: "아모스",   nameHe: "עָמוֹס",     nameEn: "Amos",          orderNo: 30, totalChapters: 9  },
  { nameKo: "오바댜",   nameHe: "עֹבַדְיָה",  nameEn: "Obadiah",       orderNo: 31, totalChapters: 1  },
  { nameKo: "요나",     nameHe: "יוֹנָה",     nameEn: "Jonah",         orderNo: 32, totalChapters: 4  },
  { nameKo: "미가",     nameHe: "מִיכָה",     nameEn: "Micah",         orderNo: 33, totalChapters: 7  },
  { nameKo: "나훔",     nameHe: "נַחוּם",     nameEn: "Nahum",         orderNo: 34, totalChapters: 3  },
  { nameKo: "하박국",   nameHe: "חֲבַקּוּק",  nameEn: "Habakkuk",      orderNo: 35, totalChapters: 3  },
  { nameKo: "스바냐",   nameHe: "צְפַנְיָה",  nameEn: "Zephaniah",     orderNo: 36, totalChapters: 3  },
  { nameKo: "학개",     nameHe: "חַגַּי",     nameEn: "Haggai",        orderNo: 37, totalChapters: 2  },
  { nameKo: "스가랴",   nameHe: "זְכַרְיָה",  nameEn: "Zechariah",     orderNo: 38, totalChapters: 14 },
  { nameKo: "말라기",   nameHe: "מַלְאָכִי",  nameEn: "Malachi",       orderNo: 39, totalChapters: 4  },
];

async function main() {
  console.log("Seeding bible_books...");
  for (const book of OT_BOOKS) {
    await prisma.bibleBook.upsert({
      where: { orderNo: book.orderNo },
      update: book,
      create: book,
    });
  }
  console.log(`Seeded ${OT_BOOKS.length} bible books.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
