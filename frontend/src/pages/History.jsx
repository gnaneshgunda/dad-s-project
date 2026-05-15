import { useState, useEffect } from 'react';
import axios from 'axios';
import { Loader2, Download, PlayCircle, Video } from 'lucide-react';

function History() {
  const [historyItems, setHistoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_BASE_URL}/api/history`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setHistoryItems(response.data);
      } catch (err) {
        console.error('Error fetching history:', err);
        setError('Failed to load history.');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [API_BASE_URL]);

  if (loading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-purple-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-8">Your Generation History</h1>

        {historyItems.length === 0 ? (
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 text-center text-gray-500">
            You haven't generated any explanations yet.
          </div>
        ) : (
          <div className="space-y-6">
            {historyItems.map((item) => (
              <div key={item.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">{item.title}</h3>
                    <p className="text-sm text-gray-500">
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-md text-gray-700 text-sm leading-relaxed mb-4 max-h-48 overflow-y-auto">
                  {item.text}
                </div>

                <div className="flex flex-wrap gap-4 items-center mt-4 pt-4 border-t border-gray-100">
                  {item.audio_url && (
                    <div className="flex items-center space-x-2 w-full sm:w-auto">
                      <audio controls src={`${API_BASE_URL}${item.audio_url}`} className="h-10" />
                    </div>
                  )}
                  <div className="flex gap-2 w-full sm:w-auto">
                     {item.video_url && (
                        <a
                          href={`${API_BASE_URL}${item.video_url}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                        >
                          <Video className="h-4 w-4 mr-2" />
                          View Video
                        </a>
                      )}
                      {item.audio_url && (
                        <a
                          href={`${API_BASE_URL}${item.audio_url}`}
                          download
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Audio
                        </a>
                      )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default History;
