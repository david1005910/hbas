/**
 * Vietnamese Bible book names mapping
 * Maps English names to Vietnamese names for Old Testament books
 */

export const vietnameseBibleBooks: Record<string, string> = {
  // Torah (Ngũ Kinh)
  "Genesis": "Sáng Thế Ký",
  "Exodus": "Xuất Ai Cập Ký",
  "Leviticus": "Lê Vi Ký",
  "Numbers": "Dân Số Ký",
  "Deuteronomy": "Phục Truyền Luật Lệ Ký",
  
  // Historical Books (Sách Lịch Sử)
  "Joshua": "Giô Suê",
  "Judges": "Các Quan Xét",
  "Ruth": "Ru Tơ",
  "1 Samuel": "1 Sa Mu Ên",
  "2 Samuel": "2 Sa Mu Ên",
  "1 Kings": "1 Các Vua",
  "2 Kings": "2 Các Vua",
  "1 Chronicles": "1 Sử Ký",
  "2 Chronicles": "2 Sử Ký",
  "Ezra": "E Xơ Ra",
  "Nehemiah": "Nê Hê Mi",
  "Esther": "Ê Xơ Tê",
  
  // Wisdom Books (Sách Khôn Ngoan)
  "Job": "Gióp",
  "Psalms": "Thi Thiên",
  "Proverbs": "Châm Ngôn",
  "Ecclesiastes": "Truyền Đạo",
  "Song of Songs": "Nhã Ca",
  
  // Major Prophets (Các Tiên Tri Lớn)
  "Isaiah": "Ê Sai",
  "Jeremiah": "Giê Rê Mi",
  "Lamentations": "Ca Thương",
  "Ezekiel": "Ê Xê Chi Ên",
  "Daniel": "Đa Ni Ên",
  
  // Minor Prophets (Các Tiên Tri Nhỏ)
  "Hosea": "Ô Sê",
  "Joel": "Giô Ên",
  "Amos": "A Mốt",
  "Obadiah": "Áp Đia",
  "Jonah": "Giô Na",
  "Micah": "Mi Ca",
  "Nahum": "Na Hum",
  "Habakkuk": "Ha Ba Cúc",
  "Zephaniah": "Sô Phô Ni",
  "Haggai": "A Ghê",
  "Zechariah": "Xa Cha Ri",
  "Malachi": "Ma La Chi"
};

/**
 * Get Vietnamese name for a Bible book by English name
 * @param englishName The English name of the Bible book
 * @returns The Vietnamese name, or the English name if not found
 */
export function getVietnameseBibleBookName(englishName: string): string {
  return vietnameseBibleBooks[englishName] || englishName;
}