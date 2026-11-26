export const getProductImage = (item: any) => {
  if (!item) return '';
  let resultUrl = '';

  if (item.image && typeof item.image === 'string' && item.image.trim() !== '') {
    try {
      const imgObj = JSON.parse(item.image);
      if (imgObj && imgObj.main) {
        resultUrl = imgObj.main;
      }
    } catch (e) {
      resultUrl = item.image;
    }
  }

  // Legacy Google Drive URLs are completely removed from the dataset,
  // so no filtering logic is needed here.

  // 이미지가 없으면 CJ온스타일 이미지 서버 규칙으로 만든다: goods_images/{앞2자리}/{뒤3자리}/{코드}L.jpg
  if (!resultUrl && item.code && String(item.code).length >= 8) {
    const code = String(item.code);
    resultUrl = `https://image.cjonstyle.net/goods_images/${code.substring(0, 2)}/${code.slice(-3)}/${code}L.jpg`;
  }

  return resultUrl;
};
