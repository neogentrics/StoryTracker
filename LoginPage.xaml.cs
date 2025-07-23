using System.Text;
using System.Text.Json;

namespace StoryTracker.MAUI
{
    public partial class LoginPage : ContentPage
    {
        private List<ConnectionInfo> _connections = new List<ConnectionInfo>();
        private readonly string _configFile;

        public LoginPage()
        {
            InitializeComponent();
            // Get the path to a file in the app's local data directory
            _configFile = Path.Combine(FileSystem.AppDataDirectory, "connections.json");
            LoadConnections();
        }

        private void OnConnectClicked(object sender, EventArgs e)
        {
            var connectionString = $"Host={HostEntry.Text};Database={DatabaseEntry.Text};Username={UserEntry.Text};Password={PasswordEntry.Text}";

            // In MAUI, you don't open the new window directly. You tell the application
            // to change its main page. We'll implement the actual connection test later.
            // For now, this navigates to the (currently non-existent) MainPage.
            Application.Current.MainPage = new MainPage(connectionString);
        }

        private void OnSaveClicked(object sender, EventArgs e)
        {
            var connInfo = new ConnectionInfo
            {
                Name = $"{UserEntry.Text}@{HostEntry.Text}",
                Host = HostEntry.Text,
                Database = DatabaseEntry.Text,
                User = UserEntry.Text
            };

            _connections.RemoveAll(c => c.Name == connInfo.Name);
            _connections.Add(connInfo);
            SaveConnections();
            LoadConnections();
            SavedConnectionsPicker.SelectedItem = connInfo.Name;
        }

        private void OnDeleteClicked(object sender, EventArgs e)
        {
            if (SavedConnectionsPicker.SelectedItem is string selectedName)
            {
                _connections.RemoveAll(c => c.Name == selectedName);
                SaveConnections();
                LoadConnections();
            }
        }

        private void OnPickerSelectionChanged(object sender, EventArgs e)
        {
            if (SavedConnectionsPicker.SelectedItem is string selectedName)
            {
                var selectedConnection = _connections.FirstOrDefault(c => c.Name == selectedName);
                if (selectedConnection != null)
                {
                    HostEntry.Text = selectedConnection.Host;
                    DatabaseEntry.Text = selectedConnection.Database;
                    UserEntry.Text = selectedConnection.User;
                    PasswordEntry.Text = string.Empty;
                }
            }
        }

        private void LoadConnections()
        {
            try
            {
                if (File.Exists(_configFile))
                {
                    // Note: Cross-platform encryption is very complex. For v3.0,
                    // we will store the JSON in plain text for simplicity.
                    // We can add encryption back as a v3.1 feature.
                    string json = File.ReadAllText(_configFile);
                    _connections = JsonSerializer.Deserialize<List<ConnectionInfo>>(json);
                }
            }
            catch { _connections = new List<ConnectionInfo>(); }

            SavedConnectionsPicker.ItemsSource = _connections.Select(c => c.Name).ToList();
        }

        private void SaveConnections()
        {
            string json = JsonSerializer.Serialize(_connections);
            File.WriteAllText(_configFile, json);
        }
    }

    // A simple class to hold the connection details
    public class ConnectionInfo
    {
        public string Name { get; set; }
        public string Host { get; set; }
        public string Database { get; set; }
        public string User { get; set; }
    }
}