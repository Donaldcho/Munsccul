import { ShieldCheckIcon, QrCodeIcon, DevicePhoneMobileIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'

export default function MobileLaunchpad() {
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
                <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-100">
                    <ShieldCheckIcon className="w-12 h-12 text-white" />
                </div>

                <h1 className="text-3xl font-bold text-gray-900 mb-2">Smart Njangi Mobile</h1>
                <p className="text-gray-500 mb-6">Experience the future of social finance directly on your device or preview it here.</p>

                {/* Live Mobile Web Preview */}
                <div className="relative mx-auto mb-8 w-64 h-[500px] bg-black rounded-[2.5rem] border-[6px] border-gray-800 shadow-2xl overflow-hidden group">
                    <div className="absolute top-0 w-full h-8 bg-black z-10 flex items-center justify-center">
                        <div className="w-16 h-3 bg-gray-900 rounded-full" />
                    </div>
                    <iframe
                        src="http://localhost:8083"
                        className="w-full h-full border-none pt-4"
                        title="Mobile App Preview"
                    />
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-gray-800 rounded-full" />

                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4">
                        <a
                            href="http://localhost:8083"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-white text-gray-900 px-4 py-2 rounded-xl text-xs font-bold shadow-lg flex items-center"
                        >
                            Open Separately
                            <ArrowTopRightOnSquareIcon className="w-3 h-3 ml-1" />
                        </a>
                    </div>
                </div>

                <div className="space-y-4 text-left mb-8">
                    <div className="flex items-start space-x-4">
                        <div className="p-2 bg-indigo-50 rounded-lg shrink-0">
                            <QrCodeIcon className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-900">Scan for Expo Go</h3>
                            <p className="text-xs text-gray-500">Scan code on port 8082 to test on your actual phone with native features.</p>
                        </div>
                    </div>
                </div>

                <button
                    onClick={() => window.location.href = '/'}
                    className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center group transition-transform active:scale-95"
                >
                    Return to Web Dashboard
                    <ArrowTopRightOnSquareIcon className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </button>
            </div>

            <p className="mt-8 text-gray-400 text-xs font-medium uppercase tracking-widest">
                Digitizing Social Trust • MUNSCCUL Core
            </p>
        </div>
    )
}
