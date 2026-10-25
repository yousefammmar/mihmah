// Regression: ISSUE-004 — validation messages hardcoded one grammatical gender ("نوع الحساب غير صالحة", "النبذة مطلوب")
// Found by /qa on 2026-10-25
// Report: .gstack/qa-reports/run-20261025T160958Z/qa-report-localhost-2026-10-25.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validator } from '../server/lib/validate.js';

const fields = (build) => {
  try { build(validator).done(); } catch (err) { return err.fields; }
  assert.fail('expected a validation error');
};

test('validation messages read correctly for masculine and feminine labels', () => {
  // Masculine labels through oneOf (was feminine), feminine labels through str (was masculine), masculine through int.
  assert.deepEqual(fields((v) => v({ role: 'x', reason: '' })
    .oneOf('role', ['student'], { label: 'نوع الحساب' })
    .oneOf('reason', ['spam'], { label: 'السبب' })), {
    role: 'اختر نوع الحساب من الخيارات المتاحة.',
    reason: 'اختر السبب من الخيارات المتاحة.',
  });
  assert.deepEqual(fields((v) => v({ summary: 'قصير', password: 5, details: 'x'.repeat(30) })
    .str('bio', { label: 'النبذة' })
    .str('summary', { min: 20, label: 'النبذة' })
    .str('password', { label: 'كلمة المرور' })
    .str('details', { max: 20, label: 'التفاصيل' })), {
    bio: 'يرجى إدخال النبذة.',
    summary: 'عدد أحرف النبذة أقل من الحد الأدنى: 4 من 20.',
    password: 'قيمة كلمة المرور غير صالحة.',
    details: 'عدد أحرف التفاصيل يتجاوز الحد الأقصى (20).',
  });
  assert.deepEqual(fields((v) => v({ score: 9 }).int('rating', { min: 1, max: 5, label: 'التقييم' }).int('score', { min: 1, max: 5, label: 'التقييم' })), {
    rating: 'يرجى إدخال التقييم.',
    score: 'يجب أن تكون قيمة التقييم رقماً صحيحاً بين 1 و5.',
  });
  assert.deepEqual(fields((v) => v({ skills: [], links: Array(13).fill('a') })
    .list('skills', { min: 1, label: 'المهارات' })
    .list('links', { max: 12, label: 'الروابط' })), {
    skills: 'عدد عناصر المهارات أقل من الحد الأدنى (1).',
    links: 'عدد عناصر الروابط يتجاوز الحد الأقصى (12).',
  });
});
