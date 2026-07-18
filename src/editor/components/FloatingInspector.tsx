import * as Separator from '@radix-ui/react-separator';
import { useState } from 'react';
import {
  Ban,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Diamond,
  Film,
  Gauge,
  Image,
  RotateCcw,
  WandSparkles,
  X,
} from 'lucide-react';

type InspectorSection = 'basic' | 'background' | 'smart' | 'animation' | 'speed';

export function FloatingInspector() {
  const [activeSection, setActiveSection] =
    useState<InspectorSection>('basic');

  const sectionTitle = {
    basic: '基本',
    background: '背景',
    smart: '智能工具',
    animation: '动画',
    speed: '变速',
  }[activeSection];

  return (
    <aside aria-label='基础属性面板' className='oc-floating-inspector'>
      <div className='oc-floating-inspector__panel'>
        <header className='oc-floating-inspector__header'>
          <h2>{sectionTitle}</h2>
          <X aria-hidden='true' size={19} />
        </header>
        <div className='oc-floating-inspector__main'>
          {activeSection === 'basic' && (
            <>
              <Separator.Root
                className='oc-floating-inspector__separator oc-floating-inspector__separator--header'
                decorative
                orientation='horizontal'
              />

              <div className='oc-floating-inspector__body oc-scrollbar'>
                <section className='oc-floating-inspector__section'>
                  <h3>蒙版</h3>
                  <div className='oc-floating-inspector__option-row'>
                    <span className='oc-floating-inspector__option-icon'>
                      <Ban aria-hidden='true' size={19} />
                    </span>
                    <span className='oc-floating-inspector__muted'>无</span>
                    <ChevronRight aria-hidden='true' size={17} />
                  </div>
                </section>
                <Separator.Root
                  className='oc-floating-inspector__separator'
                  decorative
                  orientation='horizontal'
                />

                <section className='oc-floating-inspector__section'>
                  <div className='oc-floating-inspector__option-row oc-floating-inspector__option-row--plain'>
                    <span>
                      <strong>
                        颜色调整
                        <span
                          aria-label='有可用调整'
                          className='oc-floating-inspector__status-dot'
                        />
                      </strong>
                      <small>基本</small>
                    </span>
                    <ChevronRight aria-hidden='true' size={17} />
                  </div>
                </section>
                <Separator.Root
                  className='oc-floating-inspector__separator'
                  decorative
                  orientation='horizontal'
                />

                <section className='oc-floating-inspector__section'>
                  <div className='oc-floating-inspector__section-heading'>
                    <h3>混合</h3>
                    <RotateCcw aria-hidden='true' size={16} />
                  </div>

                  <label className='oc-floating-inspector__field'>
                    <span>模式</span>
                    <span className='oc-floating-inspector__select'>
                      正常
                      <ChevronDown aria-hidden='true' size={17} />
                    </span>
                  </label>

                  <label className='oc-floating-inspector__field'>
                    <span>不透明度</span>
                    <span className='oc-floating-inspector__value-row'>
                      <input
                        aria-label='不透明度'
                        disabled
                        max='100'
                        min='0'
                        type='range'
                        value='100'
                      />
                      <output>100%</output>
                      <Diamond aria-hidden='true' size={16} />
                    </span>
                  </label>
                </section>
                <Separator.Root
                  className='oc-floating-inspector__separator'
                  decorative
                  orientation='horizontal'
                />

                <section className='oc-floating-inspector__section'>
                  <div className='oc-floating-inspector__section-heading'>
                    <h3>转换</h3>
                    <RotateCcw aria-hidden='true' size={16} />
                  </div>

                  <label className='oc-floating-inspector__field'>
                    <span>缩放</span>
                    <span className='oc-floating-inspector__value-row'>
                      <input
                        aria-label='缩放'
                        disabled
                        max='100'
                        min='0'
                        type='range'
                        value='41'
                      />
                      <output>41%</output>
                      <Diamond aria-hidden='true' size={16} />
                    </span>
                  </label>

                  <div className='oc-floating-inspector__field'>
                    <span>位置</span>
                    <span className='oc-floating-inspector__position-row'>
                      <output>X&nbsp;&nbsp;0</output>
                      <output>Y&nbsp;&nbsp;0</output>
                    </span>
                  </div>
                </section>
              </div>
            </>
          )}
        </div>
      </div>

      <nav aria-label='属性分类' className='oc-floating-inspector__rail'>
        <button
          aria-current={activeSection === 'basic' ? 'page' : undefined}
          className={`oc-floating-inspector__rail-item${activeSection === 'basic' ? ' oc-is-active' : ''}`}
          onClick={() => setActiveSection('basic')}
          type='button'
        >
          <Film aria-hidden='true' size={20} />
          <span>基本</span>
        </button>
        <button
          aria-current={activeSection === 'background' ? 'page' : undefined}
          className={`oc-floating-inspector__rail-item${activeSection === 'background' ? ' oc-is-active' : ''}`}
          onClick={() => setActiveSection('background')}
          type='button'
        >
          <Image aria-hidden='true' size={20} />
          <span>背景</span>
        </button>
        <button
          aria-current={activeSection === 'smart' ? 'page' : undefined}
          className={`oc-floating-inspector__rail-item${activeSection === 'smart' ? ' oc-is-active' : ''}`}
          onClick={() => setActiveSection('smart')}
          type='button'
        >
          <WandSparkles aria-hidden='true' size={20} />
          <span>智能工具</span>
        </button>
        <button
          aria-current={activeSection === 'animation' ? 'page' : undefined}
          className={`oc-floating-inspector__rail-item${activeSection === 'animation' ? ' oc-is-active' : ''}`}
          onClick={() => setActiveSection('animation')}
          type='button'
        >
          <CircleDashed aria-hidden='true' size={20} />
          <span>动画</span>
        </button>
        <button
          aria-current={activeSection === 'speed' ? 'page' : undefined}
          className={`oc-floating-inspector__rail-item${activeSection === 'speed' ? ' oc-is-active' : ''}`}
          onClick={() => setActiveSection('speed')}
          type='button'
        >
          <Gauge aria-hidden='true' size={20} />
          <span>变速</span>
        </button>
      </nav>
    </aside>
  );
}
