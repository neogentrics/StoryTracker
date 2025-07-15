using System;
using System.Collections.Generic;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace StoryTracker
{
    public partial class MainWindow : Window
    {
        private readonly DatabaseService _dbService;
        private Story? _selectedStory;
        private List<Story> _allStories = new List<Story>();

        // Dependency Properties for Global Font Settings
        public static readonly DependencyProperty AppFontSizeProperty =
            DependencyProperty.Register(nameof(AppFontSize), typeof(double), typeof(MainWindow), new PropertyMetadata(14.0));

        public double AppFontSize
        {
            get { return (double)GetValue(AppFontSizeProperty); }
            set { SetValue(AppFontSizeProperty, value); }
        }

        public static readonly DependencyProperty AppFontFamilyProperty =
            DependencyProperty.Register(nameof(AppFontFamily), typeof(FontFamily), typeof(MainWindow), new PropertyMetadata(new FontFamily("Segoe UI")));

        public FontFamily AppFontFamily
        {
            get { return (FontFamily)GetValue(AppFontFamilyProperty); }
            set { SetValue(AppFontFamilyProperty, value); }
        }

        public MainWindow(string connectionString)
        {
            InitializeComponent();
            _dbService = new DatabaseService(connectionString);
            LoadStories();
            SetPlaceholderText();
        }

        private void LoadStories()
        {
            try
            {
                // The method from your DatabaseService now returns the list
                _allStories = _dbService.LoadStoryTitles();
                UpdateStoryListBox(); // Update the UI with the full list
                AppStatusTextBlock.Text = "Ready.";
            }
            catch (Exception ex) { MessageBox.Show(ex.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error); }
        }

        private void StoryListBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (StoryListBox.SelectedItem is not Story selected)
            {
                ClearForm();
                return;
            }

            try
            {
                _selectedStory = _dbService.GetStoryDetails(selected.Id);
                TitleTextBox.Text = _selectedStory.Title;
                StoryTypeTextBox.Text = _selectedStory.StoryType;
                GenreTextBox.Text = _selectedStory.Genre;
                StoryStatusTextBox.Text = _selectedStory.Status;
                WordCountTextBlock.Text = _selectedStory.WordCount.ToString();
                StoryTextBox.Text = _selectedStory.StoryText;
                AppStatusTextBlock.Text = $"Selected '{_selectedStory.Title}'.";
            }
            catch (Exception ex) { MessageBox.Show(ex.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error); }
        }

        private void AddButton_Click(object sender, RoutedEventArgs e)
        {
            ClearForm();
            TitleTextBox.Focus();
            AppStatusTextBlock.Text = "Ready to create a new story.";
        }

        private void DeleteButton_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedStory == null || _selectedStory.Id == 0)
            {
                MessageBox.Show("Please select a story to delete.");
                return;
            }

            if (MessageBox.Show($"Are you sure you want to permanently delete '{_selectedStory.Title}'?", "Confirm Delete", MessageBoxButton.YesNo) == MessageBoxResult.Yes)
            {
                try
                {
                    _dbService.DeleteStory(_selectedStory.Id);
                    AppStatusTextBlock.Text = "Story successfully deleted.";
                    LoadStories();
                    ClearForm();
                }
                catch (Exception ex) { MessageBox.Show(ex.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error); }
            }
        }

        private void SaveButton_Click(object sender, RoutedEventArgs e)
        {
            if (string.IsNullOrWhiteSpace(TitleTextBox.Text))
            {
                MessageBox.Show("Title cannot be empty.");
                return;
            }

            var storyToSave = new Story
            {
                Id = _selectedStory?.Id ?? 0,
                Title = TitleTextBox.Text,
                StoryType = StoryTypeTextBox.Text,
                Genre = GenreTextBox.Text,
                Status = StoryStatusTextBox.Text,
                StoryText = StoryTextBox.Text,
                WordCount = StoryTextBox.Text.Split(new[] { ' ', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries).Length
            };

            try
            {
                _dbService.SaveStory(storyToSave);
                AppStatusTextBlock.Text = $"Story '{storyToSave.Title}' saved successfully.";
                LoadStories();
                MessageBox.Show("Saved successfully!");
            }
            catch (Exception ex) { MessageBox.Show(ex.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error); }
        }

        private void ClearForm()
        {
            _selectedStory = null;
            StoryListBox.SelectedItem = null;
            TitleTextBox.Text = "";
            StoryTypeTextBox.Text = "";
            GenreTextBox.Text = "";
            StoryStatusTextBox.Text = "";
            WordCountTextBlock.Text = "--";
            StoryTextBox.Text = "";
            AppStatusTextBlock.Text = "Ready.";
        }

        // --- All Menu Click Handlers ---

        private void ExitMenuItem_Click(object sender, RoutedEventArgs e)
        {
            Application.Current.Shutdown();
        }

        private void ThemeMenuItem_Click(object sender, RoutedEventArgs e)
        {
            var menuItem = sender as MenuItem;
            if (menuItem == null || menuItem.Header == null) return;
            string header = menuItem.Header.ToString().Replace("_", "");
            string themeName;
            if (header == "Light Theme" || header == "Dark Theme")
            {
                themeName = header.Replace(" ", "") + ".xaml";
            }
            else
            {
                themeName = header.Replace("/", "").Replace(" ", "") + "Theme.xaml";
            }
            try
            {
                Application.Current.Resources.MergedDictionaries.Clear();
                Application.Current.Resources.MergedDictionaries.Add(new ResourceDictionary { Source = new Uri($"Themes/{themeName}", UriKind.Relative) });
                File.WriteAllText("theme.settings", themeName);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Could not load theme: {themeName}\n{ex.Message}");
            }
        }

        private void AboutMenuItem_Click(object sender, RoutedEventArgs e)
        {
            var aboutWindow = new AboutWindow();
            aboutWindow.ShowDialog();
        }

        private void FontSizeMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (sender is MenuItem menuItem && double.TryParse(menuItem.Header.ToString(), out double newSize))
            {
                AppFontSize = newSize;
            }
        }

        private void FontFamilyMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (sender is MenuItem menuItem)
            {
                AppFontFamily = new FontFamily(menuItem.Header.ToString());
            }
        }

        private void EditorFontSizeMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (sender is MenuItem menuItem && double.TryParse(menuItem.Header.ToString(), out double newSize))
            {
                StoryTextBox.FontSize = newSize;
            }
        }

        private void EditorFontFamilyMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (sender is MenuItem menuItem)
            {
                StoryTextBox.FontFamily = new FontFamily(menuItem.Header.ToString());
            }
        }

        private void UpdateStoryListBox()
        {
            var searchText = SearchTextBox.Text;

            // Check if the search box is empty or just contains the placeholder text
            if (string.IsNullOrWhiteSpace(searchText) || searchText == "Search by Title...")
            {
                // If so, show the full list
                StoryListBox.ItemsSource = _allStories;
            }
            else
            {
                // Otherwise, show the filtered list
                var filteredStories = _allStories.Where(story =>
                    story.Title.Contains(searchText, StringComparison.OrdinalIgnoreCase)
                );
                StoryListBox.ItemsSource = filteredStories;
            }
        }

        private void SearchTextBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            // Don't filter if the text is the placeholder
            if (SearchTextBox.Text != "Search by Title...")
            {
                UpdateStoryListBox();
            }
        }

        private void SetPlaceholderText()
        {
            if (string.IsNullOrEmpty(SearchTextBox.Text))
            {
                SearchTextBox.Text = "Search by Title...";
                SearchTextBox.Foreground = Brushes.Gray;
                SearchTextBox.FontStyle = FontStyles.Italic;
            }
        }

        private void SearchTextBox_GotFocus(object sender, RoutedEventArgs e)
        {
            // If the text is the placeholder, clear it when the user clicks in
            if (SearchTextBox.Text == "Search by Title...")
            {
                SearchTextBox.Text = "";
                // Use the dynamic resource so the color updates with the theme
                SearchTextBox.SetResourceReference(ForegroundProperty, "ForegroundColor");
                SearchTextBox.FontStyle = FontStyles.Normal;
            }
        }

        private void SearchTextBox_LostFocus(object sender, RoutedEventArgs e)
        {
            // If the user clicks out and the box is empty, restore the placeholder
            SetPlaceholderText();
        }

        private void EditorTextColorMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (sender is MenuItem menuItem && menuItem.Tag is string colorName)
            {
                // Use a BrushConverter to turn the color name string (e.g., "Red") into an actual Brush
                var converter = new System.Windows.Media.BrushConverter();
                if (converter.ConvertFromString(colorName) is System.Windows.Media.Brush newBrush)
                {
                    StoryTextBox.Foreground = newBrush;
                }
            }
        }

    }
}