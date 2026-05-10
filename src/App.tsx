import {
  Facebook,
  Instagram,
  Search,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  Twitter,
  User,
  Zap,
} from 'lucide-react';

type Product = {
  id: number;
  name: string;
  description: string;
  price: number;
  tag?: string;
  tagClass?: string;
  image: string;
};

const products: Product[] = [
  {
    id: 1,
    name: '매콤 쌀 크래커',
    description: '한 입에 터지는 길거리 떡볶이 소스 감성.',
    price: 5900,
    tag: 'HOT',
    tagClass: 'bg-berry-pop text-white',
    image:
      'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 2,
    name: '허니버터 감자칩',
    description: '달콤하고 짭짤한 국민 단짠 조합.',
    price: 6500,
    tag: 'BEST',
    tagClass: 'bg-lime-pop text-ink',
    image:
      'https://images.unsplash.com/photo-1621447504864-d8686e12698c?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 3,
    name: '초코 콘 퍼프',
    description: '바삭한 옥수수 퍼프에 진한 코코아 코팅.',
    price: 4900,
    tag: 'NEW',
    tagClass: 'bg-blue-pop text-white',
    image:
      'https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 4,
    name: '오징어 땅콩볼',
    description: '고소한 땅콩과 짭조름한 해물 풍미.',
    price: 7200,
    image:
      'https://images.unsplash.com/photo-1600952841320-db92ec4047ca?auto=format&fit=crop&w=900&q=80',
  },
];

const categories = ['달콤 팝', '매운맛', '분식 박스', '신상 드롭'];

const formatPrice = (price: number) => `${price.toLocaleString('ko-KR')}원`;

export default function App() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="fixed inset-x-0 top-0 z-50 border-b-[3px] border-ink bg-lime-pop">
        <nav className="mx-auto flex w-full max-w-screen-2xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <a
            href="#top"
            className="-rotate-1 bg-ink px-2 font-headline text-2xl font-black uppercase tracking-normal text-lime-pop md:text-3xl"
          >
            K-Snack Pang!
          </a>

          <div className="hidden items-center gap-6 md:flex">
            {categories.map((item) => (
              <a
                key={item}
                className="px-2 py-1 font-headline text-sm font-black uppercase transition-colors hover:bg-ink hover:text-white"
                href="#snacks"
              >
                {item}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3 md:gap-4">
            <label className="hidden items-center border-[3px] border-ink bg-white px-3 py-1 lg:flex">
              <Search className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">과자 검색</span>
              <input
                className="ml-2 w-32 border-none bg-transparent font-headline text-sm uppercase outline-none placeholder:text-ink/50"
                placeholder="과자 찾기"
                type="search"
              />
            </label>
            <button className="transition-transform hover:scale-110" aria-label="내 계정">
              <User className="h-6 w-6" />
            </button>
            <button className="relative transition-transform hover:scale-110" aria-label="장바구니">
              <ShoppingBag className="h-6 w-6" />
              <span className="absolute -right-2 -top-2 border-[3px] border-ink bg-berry-pop px-1.5 py-0.5 font-headline text-[10px] font-black text-white">
                3
              </span>
            </button>
          </div>
        </nav>
      </header>

      <main id="top" className="mx-auto max-w-screen-2xl px-4 pb-12 pt-28 md:px-8">
        <section className="mb-16">
          <div className="group relative min-h-[520px] overflow-hidden border-[3px] border-ink bg-ink shadow-sticker-lg">
            <img
              alt="서울 야시장 과자 진열대"
              className="absolute inset-0 h-full w-full object-cover grayscale transition duration-500 group-hover:grayscale-0"
              src="https://images.unsplash.com/photo-1532636875304-0c89119d9b4d?auto=format&fit=crop&w=1800&q=80"
            />
            <div className="absolute inset-0 bg-blue-pop/45 mix-blend-multiply" />
            <div className="relative z-10 flex min-h-[520px] items-center px-5 py-12 md:px-12">
              <div className="max-w-2xl border-[3px] border-ink bg-white p-6 shadow-sticker md:p-8">
                <span className="mb-4 inline-flex items-center gap-2 bg-berry-pop px-3 py-1 font-headline text-xs font-black uppercase text-white">
                  <Sparkles className="h-4 w-4" />
                  오늘의 팡 지수 100%
                </span>
                <h1 className="mb-6 font-headline text-5xl font-black uppercase leading-[0.95] tracking-normal md:text-7xl">
                  서울 과자 습격전
                </h1>
                <p className="mb-8 inline-block bg-lime-pop px-2 font-headline text-lg font-bold uppercase md:text-xl">
                  매운맛부터 단짠까지, 한국 스낵을 한 번에 담으세요.
                </p>
                <a
                  href="#snacks"
                  className="inline-flex items-center gap-3 border-[3px] border-ink bg-ink px-8 py-4 font-headline text-xl font-black uppercase text-white transition-colors hover:bg-berry-pop md:px-12 md:text-2xl"
                >
                  바로 쇼핑
                  <Zap className="h-6 w-6" />
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="snacks" className="mb-24 scroll-mt-28">
          <div className="mb-10 flex items-center gap-6 md:mb-12">
            <h2 className="font-headline text-4xl font-black uppercase italic tracking-normal md:text-6xl">
              인기 과자
            </h2>
            <div className="h-4 flex-grow border-[3px] border-ink bg-lime-pop" />
            <span className="hidden font-headline text-2xl font-black uppercase md:block">
              베스트만 모았습니다
            </span>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
            {products.map((product) => (
              <article
                key={product.id}
                className="group flex flex-col border-[3px] border-ink bg-white p-4 shadow-sticker transition-transform hover:-translate-y-2"
              >
                <div className="relative mb-6 h-64 overflow-hidden border-[3px] border-ink bg-soft-gray">
                  <img
                    alt={product.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    src={product.image}
                  />
                  {product.tag ? (
                    <span
                      className={`absolute left-2 top-2 border-[3px] border-ink px-2 py-1 font-headline text-[10px] font-black uppercase ${product.tagClass}`}
                    >
                      {product.tag}
                    </span>
                  ) : null}
                </div>
                <h3 className="mb-1 font-headline text-2xl font-black uppercase italic">
                  {product.name}
                </h3>
                <p className="mb-4 font-label text-sm text-ink/80">{product.description}</p>
                <div className="mt-auto flex items-center justify-between">
                  <span className="font-headline text-3xl font-black text-blue-pop">
                    {formatPrice(product.price)}
                  </span>
                  <button
                    className="border-[3px] border-ink bg-lime-pop p-3 transition-colors hover:bg-ink hover:text-white"
                    aria-label={`${product.name} 장바구니 담기`}
                  >
                    <ShoppingCart className="h-6 w-6" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mb-24">
          <div className="relative overflow-hidden border-[3px] border-ink bg-berry-pop p-6 shadow-sticker-lg md:p-12">
            <div className="absolute inset-x-0 top-0 flex overflow-hidden whitespace-nowrap border-b-[3px] border-ink bg-lime-pop py-2">
              {[0, 1].map((item) => (
                <div
                  key={item}
                  className="inline-block min-w-full animate-[marquee_20s_linear_infinite] px-4 font-headline text-sm font-black uppercase"
                >
                  세일 세일 세일 팡딜 팡딜 세일 세일 세일 팡딜 팡딜 세일 세일 세일 팡딜 팡딜
                </div>
              ))}
            </div>

            <div className="relative z-10 mt-10 grid items-center gap-12 lg:grid-cols-2">
              <div>
                <h2 className="-rotate-2 font-headline text-5xl font-black uppercase leading-[0.9] tracking-normal text-white md:text-7xl">
                  Snack Pang!
                  <br />
                  Flash Drop
                </h2>
                <p className="mb-10 mt-6 inline-block bg-ink px-3 py-1 font-headline text-lg font-bold uppercase text-white md:text-xl">
                  오늘 자정까지 최대 50% 할인
                </p>
                <div className="flex flex-wrap gap-4">
                  <a
                    href="#snacks"
                    className="border-[3px] border-ink bg-lime-pop px-8 py-4 font-headline text-xl font-black uppercase transition-colors hover:bg-white md:text-2xl"
                  >
                    특가 담기
                  </a>
                  <div className="flex items-center border-[3px] border-ink bg-ink px-6 py-4 font-headline text-xl font-black uppercase text-white">
                    코드: PANG50
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rotate-3 border-[3px] border-ink bg-white p-4 shadow-sticker">
                  <img
                    alt="불닭 소스"
                    className="mb-2 h-32 w-full border-[3px] border-ink object-cover"
                    src="https://images.unsplash.com/photo-1604908812868-4849075c9de4?auto=format&fit=crop&w=700&q=80"
                  />
                  <p className="font-headline text-sm font-black uppercase">불닭 소스</p>
                  <span className="font-headline text-lg font-black italic text-berry-pop">
                    -50%
                  </span>
                </div>
                <div className="-rotate-3 border-[3px] border-ink bg-lime-pop p-4 shadow-sticker md:mt-8">
                  <img
                    alt="와사비 완두콩"
                    className="mb-2 h-32 w-full border-[3px] border-ink object-cover"
                    src="https://images.unsplash.com/photo-1606502973842-f64bc2785fe5?auto=format&fit=crop&w=700&q=80"
                  />
                  <p className="font-headline text-sm font-black uppercase">와사비 완두콩</p>
                  <span className="font-headline text-lg font-black italic text-ink">-30%</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative mb-12 overflow-hidden border-[3px] border-ink bg-blue-pop px-4 py-20 text-center shadow-sticker-lg">
          <div className="relative z-10">
            <div className="mb-5 flex justify-center gap-2 text-lime-pop">
              {[0, 1, 2, 3, 4].map((star) => (
                <Star key={star} className="h-6 w-6 fill-current" />
              ))}
            </div>
            <h2 className="mb-4 font-headline text-4xl font-black uppercase italic tracking-normal text-white md:text-6xl">
              팡클럽 가입
            </h2>
            <p className="mx-auto mb-10 max-w-xl font-headline text-lg font-bold uppercase text-white">
              신상 입고 알림과 첫 구매 15% 쿠폰을 가장 먼저 받으세요.
            </p>
            <form
              className="mx-auto flex max-w-lg flex-col items-stretch justify-center md:flex-row"
              onSubmit={(event) => event.preventDefault()}
            >
              <label className="sr-only" htmlFor="email">
                이메일
              </label>
              <input
                id="email"
                className="w-full border-[3px] border-ink px-6 py-5 font-headline font-bold text-ink outline-none md:border-r-0"
                placeholder="YOUR@EMAIL.COM"
                type="email"
              />
              <button className="border-[3px] border-ink bg-ink px-10 py-5 font-headline text-2xl font-black uppercase text-lime-pop transition-colors hover:bg-berry-pop hover:text-white">
                보내기
              </button>
            </form>
          </div>
        </section>
      </main>

      <footer className="border-t-[3px] border-ink bg-ink text-white">
        <div className="mx-auto flex w-full max-w-screen-2xl flex-col items-start justify-between gap-12 px-8 py-16 md:flex-row md:px-12">
          <div className="max-w-xs">
            <span className="font-headline text-4xl font-black uppercase tracking-normal text-lime-pop">
              K-Snack Pang!
            </span>
            <p className="mt-6 font-headline text-sm font-bold uppercase leading-tight text-white/80">
              서울 스낵 감성을 가장 빠르게 배송하는 과자 편집숍.
            </p>
            <div className="mt-8 flex gap-4">
              {[Instagram, Twitter, Facebook].map((Icon, index) => (
                <a
                  key={index}
                  href="#top"
                  className="text-lime-pop transition-transform hover:scale-125"
                  aria-label="소셜 링크"
                >
                  <Icon className="h-8 w-8" />
                </a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-16">
            <div className="flex flex-col gap-3">
              <span className="mb-2 font-headline text-lg font-black uppercase italic text-lime-pop">
                Shop
              </span>
              {categories.slice(0, 3).map((link) => (
                <a
                  key={link}
                  className="font-headline text-sm font-bold uppercase transition-colors hover:text-berry-pop"
                  href="#snacks"
                >
                  {link}
                </a>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <span className="mb-2 font-headline text-lg font-black uppercase italic text-lime-pop">
                Info
              </span>
              {['브랜드 소개', '배송 조회', '문의하기'].map((link) => (
                <a
                  key={link}
                  className="font-headline text-sm font-bold uppercase transition-colors hover:text-berry-pop"
                  href="#top"
                >
                  {link}
                </a>
              ))}
            </div>
          </div>

          <div className="flex w-full flex-col gap-4 md:w-auto md:items-end md:text-right">
            <div className="flex gap-6">
              <a className="font-headline text-sm font-black uppercase hover:text-lime-pop" href="#top">
                Privacy
              </a>
              <a className="font-headline text-sm font-black uppercase hover:text-lime-pop" href="#top">
                Terms
              </a>
            </div>
            <p className="font-headline text-xs font-black uppercase text-lime-pop/60 md:pt-12">
              © 2026 K-Snack Pang. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
