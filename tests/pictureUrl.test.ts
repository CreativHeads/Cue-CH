import { describe, expect, it } from 'vitest';
import { pictureUrl, STORY_FIELDS } from '../src/lib/instagram';

describe('pictureUrl', () => {
  it('uses the image itself for single images and carousels', () => {
    expect(pictureUrl({ media_type: 'IMAGE', media_url: 'https://cdn/img.jpg' })).toBe('https://cdn/img.jpg');
    expect(pictureUrl({ media_type: 'CAROUSEL_ALBUM', media_url: 'https://cdn/first.jpg' })).toBe('https://cdn/first.jpg');
  });
  it('uses the thumbnail for videos and reels, never the video file', () => {
    expect(pictureUrl({ media_type: 'VIDEO', media_url: 'https://cdn/v.mp4', media_thumbnail_url: 'https://cdn/t.jpg' })).toBe('https://cdn/t.jpg');
    expect(pictureUrl({ media_type: 'VIDEO', media_product_type: 'REELS', media_url: 'https://cdn/v.mp4' })).toBeNull();
  });
  it('uses the story thumbnail for stories', () => {
    expect(pictureUrl({ story_id: '1', story_thumbnail_url: 'https://cdn/s.jpg' })).toBe('https://cdn/s.jpg');
    expect(STORY_FIELDS).toContain('story_thumbnail_url');
  });
});
