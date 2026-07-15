// WhichOutfit — Shared JS

// Nav: glass on scroll
const nav = document.querySelector('.nav');
if (nav) {
  const onScroll = () => nav.classList.toggle('solid', window.scrollY > 60);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// Fade-up on scroll
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.fade-up').forEach(el => {
  const inHero = el.closest('.hero, .page-hero');
  if (inHero) {
    const delay = parseInt(el.className.match(/\bd(\d)\b/)?.[1] || 0) * 100;
    setTimeout(() => el.classList.add('in'), 80 + delay);
  } else {
    io.observe(el);
  }
});

// Mobile nav toggle
const burger = document.querySelector('.nav-burger');
if (burger) {
  burger.addEventListener('click', () => nav.classList.toggle('open'));
  document.addEventListener('click', e => {
    if (nav.classList.contains('open') && !nav.contains(e.target)) {
      nav.classList.remove('open');
    }
  });
}

// FAQ accordion — allow only one open at a time per group
document.querySelectorAll('.faq-q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const group = item.closest('.faq-group');
    const isOpen = item.classList.contains('open');
    if (group) {
      group.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
    }
    if (!isOpen) item.classList.add('open');
  });
});

// Count-up numbers (e.g. the hero score chip)
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.querySelectorAll('[data-countup]').forEach(el => {
    const target = parseInt(el.dataset.countup, 10);
    let t0 = null;
    const dur = 1400;
    const step = ts => {
      if (!t0) t0 = ts;
      const p = Math.min((ts - t0) / dur, 1);
      el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target);
      if (p < 1) requestAnimationFrame(step);
    };
    setTimeout(() => requestAnimationFrame(step), 500);
  });
}
