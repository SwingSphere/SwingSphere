import React from 'react';
import { useNavigate } from 'react-router-dom';

const Footer: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const navigate = useNavigate();

  return (
    <footer className={`bg-black/50 text-gray-500 border-t border-gray-800/50 ${compact ? 'py-4' : 'py-12'}`}>
      <div className="container mx-auto px-6 lg:px-8">
        <div className={compact
          ? 'flex flex-col gap-3 text-xs md:flex-row md:items-center md:justify-between'
          : 'grid grid-cols-2 md:grid-cols-4 gap-8 mb-8 text-sm'}>
          <div className={compact ? 'flex items-center gap-3' : 'col-span-2 md:col-span-1'}>
            <h4 className={`font-bold text-gray-200 tracking-widest uppercase ${compact ? 'text-sm' : 'mb-3 text-base'}`}><span className="text-red-500">Swing</span>Sphere</h4>
            {!compact && <p className="pr-4">Discover Your Scene. Connect with Your Community.</p>}
          </div>
          <div className={compact ? 'flex flex-wrap gap-x-5 gap-y-2' : ''}>
            {!compact && <h4 className="font-bold text-gray-300 mb-3">Navigate</h4>}
            <ul className={compact ? 'flex flex-wrap gap-x-4 gap-y-2' : 'space-y-2'}>
              <li><button type="button" onClick={() => navigate('/about')} className="hover:text-white transition-colors bg-transparent p-0 text-left">About Us</button></li>
              <li><button type="button" onClick={() => navigate('/faq')} className="hover:text-white transition-colors bg-transparent p-0 text-left">FAQ</button></li>
              <li><button type="button" onClick={() => navigate('/contact')} className="hover:text-white transition-colors bg-transparent p-0 text-left">Contact</button></li>
            </ul>
          </div>
          <div>
            {!compact && <h4 className="font-bold text-gray-300 mb-3">Legal</h4>}
            <ul className={compact ? 'flex flex-wrap gap-x-4 gap-y-2' : 'space-y-2'}>
              <li><button type="button" onClick={() => navigate('/privacy')} className="hover:text-white transition-colors bg-transparent p-0 text-left">Privacy Policy</button></li>
              <li><button type="button" onClick={() => navigate('/tos')} className="hover:text-white transition-colors bg-transparent p-0 text-left">Terms of Service</button></li>
            </ul>
          </div>
          {compact && <p className="text-gray-600">&copy; 2025 <span className="text-red-500">Swing</span>Sphere</p>}
        </div>
        {!compact && (
          <div className="border-t border-gray-800 pt-8 text-center text-sm">
            <p>&copy; 2025 <span className="text-red-500">Swing</span>Sphere. All rights reserved.</p>
          </div>
        )}
      </div>
    </footer>
  );
};
export default Footer;
