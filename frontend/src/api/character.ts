import { api } from "./client";

export interface CharacterImage {
  id: string;
  episodeId: string;
  name: string;
  description?: string;
  imageUrl: string;
  orderIndex: number;
  createdAt: string;
}

export interface CharacterImageUploadData {
  name?: string;
  description?: string;
}

export const characterApi = {
  // 에피소드의 캐릭터 이미지 목록 조회
  getCharacterImages: (episodeId: string) =>
    api.get<{ images: CharacterImage[] }>(`/episodes/${episodeId}/characters`).then(r => r.data),

  // 캐릭터 이미지 업로드
  uploadCharacterImage: (episodeId: string, file: File, data: CharacterImageUploadData) => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('name', data.name || '');
    formData.append('description', data.description || '');
    
    return api.post<{ message: string; image: CharacterImage }>(
      `/episodes/${episodeId}/characters`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    ).then(r => r.data);
  },

  // 캐릭터 이미지 수정
  updateCharacterImage: (imageId: string, data: Partial<CharacterImageUploadData> & { orderIndex?: number }) =>
    api.put<{ message: string; image: CharacterImage }>(`/characters/${imageId}`, data).then(r => r.data),

  // 캐릭터 이미지 삭제
  deleteCharacterImage: (imageId: string) =>
    api.delete<{ message: string }>(`/characters/${imageId}`).then(r => r.data),

  // 캐릭터 이미지 URL 생성
  getImageUrl: (episodeId: string, filename: string) => 
    `${api.defaults.baseURL}/characters/${episodeId}/${filename}`,
};